import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { prisma } from "../src/lib/db.js";
import { buildApp } from "../src/app.js";
import { addMember, cleanDb, setupUser } from "./helpers.js";

const CLIENT_HEADERS = { "x-oda-client": "web" };

let app: FastifyInstance;
let port: number;
const sockets: WebSocket[] = [];

function wsUrl(): string {
  return `ws://127.0.0.1:${port}/ws`;
}

function connect(cookie?: string): WebSocket {
  const ws = new WebSocket(
    wsUrl(),
    cookie ? { headers: { cookie: `oda_session=${cookie}` } } : undefined,
  );
  sockets.push(ws);
  return ws;
}

async function nextMessage(ws: WebSocket): Promise<{ type: string; data: unknown }> {
  const [data] = await once(ws, "message");
  return JSON.parse(data.toString());
}

/** Open connection, consume the READY event, return it. */
async function connectAuthed(cookie: string) {
  const ws = connect(cookie);
  await once(ws, "open");
  const ready = await nextMessage(ws);
  return { ws, ready };
}

describe("gateway", () => {
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

  it("rejects connections without a session (close code 4401)", async () => {
    const ws = connect();
    const [code] = await once(ws, "close");
    expect(code).toBe(4401);
  });

  it("sends READY with user + servers on connect", async () => {
    const { cookie, userId } = await setupUser(app, "alice");
    const { ready } = await connectAuthed(cookie);

    expect(ready.type).toBe("READY");
    const data = ready.data as { user: { id: string }; servers: unknown[] };
    expect(data.user.id).toBe(userId);
    expect(data.servers.length).toBeGreaterThan(0);
  });

  it("answers app-level PING with PONG", async () => {
    const { cookie } = await setupUser(app, "alice");
    const { ws } = await connectAuthed(cookie);

    ws.send(JSON.stringify({ type: "PING" }));
    const event = await nextMessage(ws);
    expect(event.type).toBe("PONG");
  });

  it("dispatchToChannel reaches channel members only", async () => {
    const alice = await setupUser(app, "alice");
    const bob = await setupUser(app, "bob"); // not a member of alice's server

    const created = await app.inject({
      method: "POST",
      url: "/api/servers",
      headers: CLIENT_HEADERS,
      cookies: { oda_session: alice.cookie },
      payload: { name: "Dispatch Test" },
    });
    const channelId = created.json().channels[0].id;

    const { ws: aliceWs } = await connectAuthed(alice.cookie);
    const { ws: bobWs } = await connectAuthed(bob.cookie);

    const message = {
      id: "m1",
      channelId,
      author: {
        id: alice.userId,
        username: "alice",
        displayName: "alice",
        avatarUrl: null,
      },
      content: "secret plans",
      attachments: [],
      embeds: [],
      editedAt: null,
      createdAt: "2026-08-14T12:00:00.000Z",
    };
    app.gateway.dispatchToChannel(channelId, {
      type: "MESSAGE_CREATE",
      data: message,
    });

    // alice may first receive PRESENCE_UPDATE for bob's connect (they share
    // the fixture server) — drain until the message we actually care about
    let received = await nextMessage(aliceWs);
    while (received.type !== "MESSAGE_CREATE") received = await nextMessage(aliceWs);
    expect((received.data as { content: string }).content).toBe("secret plans");

    const bobResult = await Promise.race([
      nextMessage(bobWs).then(() => "leaked" as const),
      new Promise<"silent">((r) => setTimeout(() => r("silent"), 250)),
    ]);
    expect(bobResult).toBe("silent");
  });

  it("CHANNEL_CREATE reaches all server members (server-scoped dispatch)", async () => {
    const alice = await setupUser(app, "alice");
    const bob = await setupUser(app, "bob");

    const created = await app.inject({
      method: "POST",
      url: "/api/servers",
      headers: CLIENT_HEADERS,
      cookies: { oda_session: alice.cookie },
      payload: { name: "Broadcast Server" },
    });
    const serverId = created.json().id;
    await addMember(bob.userId, serverId);

    const { ws: bobWs } = await connectAuthed(bob.cookie);

    // owner creates a channel — bob should learn about it in real time
    await app.inject({
      method: "POST",
      url: `/api/servers/${serverId}/channels`,
      headers: CLIENT_HEADERS,
      cookies: { oda_session: alice.cookie },
      payload: { name: "announcements" },
    });

    const event = await nextMessage(bobWs);
    expect(event.type).toBe("CHANNEL_CREATE");
    expect((event.data as { name: string }).name).toBe("announcements");
  });
});

describe("gateway heartbeat (unit, fake socket)", () => {
  it("terminates stale connections and pings live ones", async () => {
    const { Hub, heartbeatTick } = await import("../src/gateway/hub.js");
    const { GatewayConnection } = await import("../src/gateway/connection.js");

    const hub = new Hub();
    const fakeSocket = {
      readyState: 1,
      OPEN: 1,
      send: vi.fn(),
      ping: vi.fn(),
      terminate: vi.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn = new GatewayConnection(fakeSocket as any, "u1");
    hub.add(conn);

    conn.isAlive = false; // missed last pong
    heartbeatTick(hub);
    expect(fakeSocket.terminate).toHaveBeenCalled();

    conn.isAlive = true; // fresh connection
    heartbeatTick(hub);
    expect(fakeSocket.ping).toHaveBeenCalled();
    expect(conn.isAlive).toBe(false); // awaiting pong now
  });
});
