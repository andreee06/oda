import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { prisma } from "../src/lib/db.js";
import { buildApp } from "../src/app.js";
import { heartbeatTick } from "../src/gateway/hub.js";
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

interface WsMessage {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any; // test helper — shape varies per event type
}

async function nextMessage(ws: WebSocket): Promise<WsMessage> {
  const [data] = await once(ws, "message");
  return JSON.parse(data.toString());
}

/** Skip unrelated events (presence noise) until `type` arrives. */
async function nextOfType(
  ws: WebSocket,
  type: string,
  timeoutMs = 2000,
): Promise<WsMessage> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const msg = (await Promise.race([
      nextMessage(ws),
      new Promise<null>((r) =>
        setTimeout(() => r(null), Math.max(50, deadline - Date.now())),
      ),
    ])) as WsMessage | null;
    if (!msg) throw new Error(`timed out waiting for ${type}`);
    if (msg.type === type) return msg;
  }
}

/** Expect NO event of `type` within `windowMs`. */
async function expectSilent(
  ws: WebSocket,
  type: string,
  windowMs = 300,
): Promise<void> {
  const result = await Promise.race([
    nextOfType(ws, type, windowMs)
      .then(() => "received" as const)
      .catch(() => "silent" as const), // timeout = the silence we wanted
    new Promise<"silent">((r) => setTimeout(() => r("silent"), windowMs + 50)),
  ]);
  expect(result).toBe("silent");
}

async function connectAuthed(cookie: string) {
  const ws = connect(cookie);
  await once(ws, "open");
  const ready = await nextOfType(ws, "READY");
  return { ws, ready };
}

describe("presence", () => {
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

  it("READY contains a presence snapshot of currently-online users", async () => {
    // setupUser registers via the fixture invite → both land in the oldest
    // fixture server, so alice and bob share a server automatically.
    const alice = await setupUser(app, "alice");
    const bob = await setupUser(app, "bob");

    await connectAuthed(alice.cookie);
    const { ready } = await connectAuthed(bob.cookie);

    expect(ready.data.presences[alice.userId]).toBe("online");
  });

  it("broadcasts online → offline transitions to shared servers (multi-conn safe)", async () => {
    const alice = await setupUser(app, "alice");
    const bob = await setupUser(app, "bob");

    const { ws: bobWs } = await connectAuthed(bob.cookie);

    // attach the listener BEFORE alice connects — ws events aren't buffered
    const onlinePromise = nextOfType(bobWs, "PRESENCE_UPDATE");
    const aliceWs1 = await connectAuthed(alice.cookie);
    const online = await onlinePromise;
    expect(online.data).toEqual({ userId: alice.userId, status: "online" });

    // second tab: no duplicate "online"
    const aliceWs2 = await connectAuthed(alice.cookie);
    await expectSilent(bobWs, "PRESENCE_UPDATE");

    // closing one tab keeps alice online…
    aliceWs1.ws.close();
    await expectSilent(bobWs, "PRESENCE_UPDATE");

    // …closing the last one announces offline
    aliceWs2.ws.close();
    const offline = await nextOfType(bobWs, "PRESENCE_UPDATE");
    expect(offline.data).toEqual({ userId: alice.userId, status: "offline" });
  });

  it("does not echo a user's own presence back to them", async () => {
    const alice = await setupUser(app, "alice");
    const { ws: aliceWs } = await connectAuthed(alice.cookie);
    await expectSilent(aliceWs, "PRESENCE_UPDATE");
  });

  it("idle transition fires on heartbeat after 5min without activity", async () => {
    const alice = await setupUser(app, "alice");
    const bob = await setupUser(app, "bob");

    const { ws: bobWs } = await connectAuthed(bob.cookie);
    const onlinePromise = nextOfType(bobWs, "PRESENCE_UPDATE");
    await connectAuthed(alice.cookie);
    await onlinePromise; // alice came online

    // fake alice being inactive for 6 minutes, then run one heartbeat pass
    for (const conn of app.gateway) {
      if (conn.userId === alice.userId) {
        conn.lastActivityAt = Date.now() - 6 * 60 * 1000;
      }
    }
    // attach before the tick: dispatch is synchronous
    const idlePromise = nextOfType(bobWs, "PRESENCE_UPDATE");
    heartbeatTick(app.gateway);

    const idle = await idlePromise;
    expect(idle.data).toEqual({ userId: alice.userId, status: "idle" });
  });

  it("REST activity (posting a message) marks the author as not-idle", async () => {
    const alice = await setupUser(app, "alice");
    await connectAuthed(alice.cookie);

    const created = await app.inject({
      method: "POST",
      url: "/api/servers",
      headers: CLIENT_HEADERS,
      cookies: { oda_session: alice.cookie },
      payload: { name: "Touch Test" },
    });
    // connected via WS after creation? channel membership doesn't matter —
    // touch() is about the author. Post a message through REST.
    const channelId = created.json().channels[0].id;
    // stale the activity timestamp, then post: touch() must refresh it
    for (const conn of app.gateway) {
      if (conn.userId === alice.userId) conn.lastActivityAt = 0;
    }
    const res = await app.inject({
      method: "POST",
      url: `/api/channels/${channelId}/messages`,
      headers: CLIENT_HEADERS,
      cookies: { oda_session: alice.cookie },
      payload: { content: "still here" },
    });
    expect(res.statusCode).toBe(201);
    for (const conn of app.gateway) {
      if (conn.userId === alice.userId) {
        expect(Date.now() - conn.lastActivityAt).toBeLessThan(5000);
      }
    }
  });
});

describe("typing", () => {
  async function sharedChannel() {
    const alice = await setupUser(app, "alice");
    const bob = await setupUser(app, "bob");
    const created = await app.inject({
      method: "POST",
      url: "/api/servers",
      headers: CLIENT_HEADERS,
      cookies: { oda_session: alice.cookie },
      payload: { name: "Typing Test" },
    });
    const server = created.json();
    await addMember(bob.userId, server.id);
    return { alice, bob, channelId: server.channels[0].id as string };
  }

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

  it("relays TYPING_START to channel members except the sender", async () => {
    const { alice, bob, channelId } = await sharedChannel();
    const { ws: aliceWs } = await connectAuthed(alice.cookie);
    const { ws: bobWs } = await connectAuthed(bob.cookie);

    aliceWs.send(
      JSON.stringify({ type: "TYPING_START", data: { channelId } }),
    );

    const event = await nextOfType(bobWs, "TYPING_START");
    expect(event.data.channelId).toBe(channelId);
    expect(event.data.user.id).toBe(alice.userId);
    expect(event.data.user.displayName).toBe("alice");

    await expectSilent(aliceWs, "TYPING_START");
  });

  it("throttles repeated TYPING_START from the same user+channel", async () => {
    const { alice, bob, channelId } = await sharedChannel();
    const { ws: aliceWs } = await connectAuthed(alice.cookie);
    const { ws: bobWs } = await connectAuthed(bob.cookie);

    const payload = JSON.stringify({ type: "TYPING_START", data: { channelId } });
    aliceWs.send(payload);
    aliceWs.send(payload); // within throttle window — must be dropped

    await nextOfType(bobWs, "TYPING_START");
    await expectSilent(bobWs, "TYPING_START");
  });

  it("ignores TYPING_START for channels the sender is not in", async () => {
    const { alice, bob, channelId } = await sharedChannel();
    const { ws: bobWs } = await connectAuthed(bob.cookie);
    // alice never connects via WS; bob tries to "type" in a channel that
    // belongs to a server bob was added to — that IS his channel, so instead
    // create a private channel bob is not part of:
    const privateServer = await app.inject({
      method: "POST",
      url: "/api/servers",
      headers: CLIENT_HEADERS,
      cookies: { oda_session: alice.cookie },
      payload: { name: "Private" },
    });
    const privateChannelId = privateServer.json().channels[0].id;

    bobWs.send(
      JSON.stringify({ type: "TYPING_START", data: { channelId: privateChannelId } }),
    );
    await expectSilent(bobWs, "TYPING_START");

    // sanity: the legit channel still works
    const { ws: aliceWs } = await connectAuthed(alice.cookie);
    bobWs.send(JSON.stringify({ type: "TYPING_START", data: { channelId } }));
    const event = await nextOfType(aliceWs, "TYPING_START");
    expect(event.data.user.id).toBe(bob.userId);
  });
});
