import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { prisma } from "../src/lib/db.js";
import { buildApp } from "../src/app.js";
import { addMember, cleanDb, setupUser } from "./helpers.js";

const CLIENT_HEADERS = { "x-oda-client": "web" };

let app: FastifyInstance;
const sockets: WebSocket[] = [];

describe("PATCH /api/users/me/avatar", () => {
  beforeEach(async () => {
    await cleanDb();
    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    for (const ws of sockets.splice(0)) ws.terminate();
    await app.close();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("sets the avatar and returns the updated user", async () => {
    const { cookie } = await setupUser(app, "alice");
    const res = await app.inject({
      method: "PATCH",
      url: "/api/users/me/avatar",
      headers: CLIENT_HEADERS,
      cookies: { oda_session: cookie },
      payload: { avatarUrl: "/media/oda-media/me.gif" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.avatarUrl).toBe("/media/oda-media/me.gif");

    const inDb = await prisma.user.findFirst({ where: { username: "alice" } });
    expect(inDb?.avatarUrl).toBe("/media/oda-media/me.gif");
  });

  it("rejects non-/media URLs with 400", async () => {
    const { cookie } = await setupUser(app, "alice");
    const res = await app.inject({
      method: "PATCH",
      url: "/api/users/me/avatar",
      headers: CLIENT_HEADERS,
      cookies: { oda_session: cookie },
      payload: { avatarUrl: "https://evil.com/x.gif" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("broadcasts USER_UPDATE to server members", async () => {
    const alice = await setupUser(app, "alice");
    const bob = await setupUser(app, "bob");
    const created = await app.inject({
      method: "POST",
      url: "/api/servers",
      headers: CLIENT_HEADERS,
      cookies: { oda_session: alice.cookie },
      payload: { name: "Avatar Server" },
    });
    await addMember(bob.userId, created.json().id);

    await app.listen({ port: 0, host: "127.0.0.1" });
    const port = (app.server.address() as AddressInfo).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { cookie: `oda_session=${bob.cookie}` },
    });
    sockets.push(ws);
    await once(ws, "open");
    await once(ws, "message"); // READY

    await app.inject({
      method: "PATCH",
      url: "/api/users/me/avatar",
      headers: CLIENT_HEADERS,
      cookies: { oda_session: alice.cookie },
      payload: { avatarUrl: "/media/oda-media/new.gif" },
    });

    const [raw] = await once(ws, "message");
    const event = JSON.parse(raw.toString());
    expect(event.type).toBe("USER_UPDATE");
    expect(event.data.user.username).toBe("alice");
    expect(event.data.user.avatarUrl).toBe("/media/oda-media/new.gif");
  });
});
