import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { prisma } from "../src/lib/db.js";
import { buildApp } from "../src/app.js";
import { addMember, cleanDb, setupUser } from "./helpers.js";

const CLIENT_HEADERS = { "x-oda-client": "web" };

let app: FastifyInstance;
let port: number;
const sockets: WebSocket[] = [];

function connect(cookie: string): WebSocket {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
    headers: { cookie: `oda_session=${cookie}` },
  });
  sockets.push(ws);
  return ws;
}

interface WsMsg {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

async function collect(ws: WebSocket): Promise<WsMsg[]> {
  const events: WsMsg[] = [];
  ws.on("message", (raw) => events.push(JSON.parse(raw.toString())));
  return events;
}

async function connectAuthed(cookie: string) {
  const ws = connect(cookie);
  const eventsPromise = collect(ws);
  await once(ws, "open");
  await new Promise((r) => setTimeout(r, 150)); // let READY land
  return { ws, events: await eventsPromise };
}

/** Verify a LiveKit JWT (HS256) with the dev secret and return its payload. */
function decodeToken(token: string) {
  const [header, payload, signature] = token.split(".");
  const expected = createHmac("sha256", "secret")
    .update(`${header}.${payload}`)
    .digest();
  const actual = Buffer.from(signature!, "base64url");
  expect(actual.equals(expected)).toBe(true);
  return JSON.parse(Buffer.from(payload!, "base64url").toString());
}

async function voiceChannelAs(cookie: string, name = "Voice Club") {
  const res = await app.inject({
    method: "POST",
    url: "/api/servers",
    headers: CLIENT_HEADERS,
    cookies: { oda_session: cookie },
    payload: { name },
  });
  const server = res.json();
  const ch = await app.inject({
    method: "POST",
    url: `/api/servers/${server.id}/channels`,
    headers: CLIENT_HEADERS,
    cookies: { oda_session: cookie },
    payload: { name: "lounge", type: "voice" },
  });
  return { server, channelId: ch.json().id as string };
}

function joinVoice(cookie: string, channelId: string) {
  return app.inject({
    method: "POST",
    url: `/api/channels/${channelId}/voice/join`,
    headers: CLIENT_HEADERS,
    cookies: { oda_session: cookie },
    payload: {},
  });
}

describe("voice (slice 4)", () => {
  beforeEach(async () => {
    await cleanDb();
    app = await buildApp({ logger: false });
    await app.listen({ port: 0, host: "127.0.0.1" });
    port = (app.server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    for (const ws of sockets.splice(0)) ws.terminate();
    await app.close();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("join returns a verifiable LiveKit JWT scoped to the channel", async () => {
    const alice = await setupUser(app, "alice");
    const { channelId } = await voiceChannelAs(alice.cookie);

    const res = await joinVoice(alice.cookie, channelId);
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toContain("7880");

    const payload = decodeToken(res.json().token);
    expect(payload.sub).toBe(alice.userId);
    expect(payload.video.room).toBe(channelId);
    expect(payload.video.roomJoin).toBe(true);
  });

  it("non-members get 404 on join", async () => {
    const alice = await setupUser(app, "alice");
    const eve = await setupUser(app, "eve");
    const { channelId } = await voiceChannelAs(alice.cookie);
    expect((await joinVoice(eve.cookie, channelId)).statusCode).toBe(404);
  });

  it("join broadcasts the roster; rejoin is idempotent; leave clears it", async () => {
    const alice = await setupUser(app, "alice");
    const bob = await setupUser(app, "bob");
    const { server, channelId } = await voiceChannelAs(alice.cookie);
    await addMember(bob.userId, server.id);

    const { events: bobEvents } = await connectAuthed(bob.cookie);
    const voiceEvents = () =>
      bobEvents.filter((e) => e.type === "VOICE_STATE" && e.data.channelId === channelId);

    await joinVoice(alice.cookie, channelId);
    await new Promise((r) => setTimeout(r, 150));
    expect(voiceEvents().at(-1)?.data.participants).toHaveLength(1);
    expect(voiceEvents().at(-1)?.data.participants[0].user.username).toBe("alice");

    await joinVoice(alice.cookie, channelId); // rejoin — no duplicate
    await new Promise((r) => setTimeout(r, 150));
    expect(voiceEvents().at(-1)?.data.participants).toHaveLength(1);

    await app.inject({
      method: "POST",
      url: `/api/channels/${channelId}/voice/leave`,
      headers: CLIENT_HEADERS,
      cookies: { oda_session: alice.cookie },
      payload: {},
    });
    await new Promise((r) => setTimeout(r, 150));
    expect(voiceEvents().at(-1)?.data.participants).toHaveLength(0);
  });

  it("deafen forces muted; state change broadcasts", async () => {
    const alice = await setupUser(app, "alice");
    const bob = await setupUser(app, "bob");
    const { server, channelId } = await voiceChannelAs(alice.cookie);
    await addMember(bob.userId, server.id);
    const { events: bobEvents } = await connectAuthed(bob.cookie);

    await joinVoice(alice.cookie, channelId);
    const res = await app.inject({
      method: "POST",
      url: `/api/channels/${channelId}/voice/state`,
      headers: CLIENT_HEADERS,
      cookies: { oda_session: alice.cookie },
      payload: { muted: false, deafened: true },
    });
    expect(res.statusCode).toBe(204);
    await new Promise((r) => setTimeout(r, 150));

    const last = bobEvents.filter((e) => e.type === "VOICE_STATE").at(-1);
    expect(last?.data.participants[0].muted).toBe(true);
    expect(last?.data.participants[0].deafened).toBe(true);
  });

  it("READY contains voiceStates for my servers only", async () => {
    const alice = await setupUser(app, "alice");
    const bob = await setupUser(app, "bob");
    const { server, channelId } = await voiceChannelAs(alice.cookie);
    await addMember(bob.userId, server.id);
    await joinVoice(alice.cookie, channelId);

    const { events: bobEvents } = await connectAuthed(bob.cookie);
    const ready = bobEvents.find((e) => e.type === "READY");
    expect(ready?.data.voiceStates[channelId]).toHaveLength(1);
    expect(ready?.data.voiceStates[channelId][0].user.username).toBe("alice");
  });

  it("losing the last WS connection drops the user from voice rosters", async () => {
    const alice = await setupUser(app, "alice");
    const bob = await setupUser(app, "bob");
    const { server, channelId } = await voiceChannelAs(alice.cookie);
    await addMember(bob.userId, server.id);

    const { events: bobEvents } = await connectAuthed(bob.cookie);
    const { ws: aliceWs } = await connectAuthed(alice.cookie);
    await joinVoice(alice.cookie, channelId);
    await new Promise((r) => setTimeout(r, 150));

    aliceWs.close();
    await new Promise((r) => setTimeout(r, 400)); // close → remove → cleanup

    const last = bobEvents
      .filter((e) => e.type === "VOICE_STATE" && e.data.channelId === channelId)
      .at(-1);
    expect(last?.data.participants).toHaveLength(0);
  });
});
