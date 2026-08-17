import type { FastifyInstance } from "fastify";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/db.js";
import { buildApp } from "../src/app.js";
import { addMember, cleanDb, setupUser } from "./helpers.js";

const CLIENT_HEADERS = { "x-oda-client": "web" };

let app: FastifyInstance;

async function setupServer() {
  const alice = await setupUser(app, "alice");
  const res = await app.inject({
    method: "POST",
    url: "/api/servers",
    headers: CLIENT_HEADERS,
    cookies: { oda_session: alice.cookie },
    payload: { name: "Emoji Club" },
  });
  return { alice, serverId: res.json().id as string };
}

describe("server emoji routes", () => {
  beforeEach(async () => {
    await cleanDb();
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("owner creates an emoji (201) and members can list it", async () => {
    const { alice, serverId } = await setupServer();
    const bob = await setupUser(app, "bob");
    await addMember(bob.userId, serverId);

    const created = await app.inject({
      method: "POST",
      url: `/api/servers/${serverId}/emojis`,
      headers: CLIENT_HEADERS,
      cookies: { oda_session: alice.cookie },
      payload: { name: "pepelaugh", imageUrl: "/media/oda-media/pepe.png" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().name).toBe("pepelaugh");

    const list = await app.inject({
      method: "GET",
      url: `/api/servers/${serverId}/emojis`,
      cookies: { oda_session: bob.cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().emojis).toHaveLength(1);
    expect(list.json().emojis[0].name).toBe("pepelaugh");
  });

  it("duplicate shortcode in the same server → 409", async () => {
    const { alice, serverId } = await setupServer();
    const payload = { name: "pepelaugh", imageUrl: "/media/oda-media/p.png" };
    await app.inject({
      method: "POST",
      url: `/api/servers/${serverId}/emojis`,
      headers: CLIENT_HEADERS,
      cookies: { oda_session: alice.cookie },
      payload,
    });
    const dupe = await app.inject({
      method: "POST",
      url: `/api/servers/${serverId}/emojis`,
      headers: CLIENT_HEADERS,
      cookies: { oda_session: alice.cookie },
      payload,
    });
    expect(dupe.statusCode).toBe(409);
  });

  it("non-owner member gets 403 on create, non-member 404 on list", async () => {
    const { serverId } = await setupServer();
    const bob = await setupUser(app, "bob");
    await addMember(bob.userId, serverId);
    const charlie = await setupUser(app, "charlie");

    const forbidden = await app.inject({
      method: "POST",
      url: `/api/servers/${serverId}/emojis`,
      headers: CLIENT_HEADERS,
      cookies: { oda_session: bob.cookie },
      payload: { name: "sneaky", imageUrl: "/media/oda-media/s.png" },
    });
    expect(forbidden.statusCode).toBe(403);

    const notFound = await app.inject({
      method: "GET",
      url: `/api/servers/${serverId}/emojis`,
      cookies: { oda_session: charlie.cookie },
    });
    expect(notFound.statusCode).toBe(404);
  });

  it("validates shortcode + /media url (400)", async () => {
    const { alice, serverId } = await setupServer();
    const res = await app.inject({
      method: "POST",
      url: `/api/servers/${serverId}/emojis`,
      headers: CLIENT_HEADERS,
      cookies: { oda_session: alice.cookie },
      payload: { name: "Bad Name!", imageUrl: "https://evil.com/x.png" },
    });
    expect(res.statusCode).toBe(400);
  });
});
