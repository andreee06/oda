import type { FastifyInstance } from "fastify";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/db.js";
import { buildApp } from "../src/app.js";
import { addMember, cleanDb, setupUser } from "./helpers.js";

const CLIENT_HEADERS = { "x-oda-client": "web" };

let app: FastifyInstance;

async function createServer(cookie: string, name = "Gaming") {
  return app.inject({
    method: "POST",
    url: "/api/servers",
    headers: CLIENT_HEADERS,
    cookies: { oda_session: cookie },
    payload: { name },
  });
}

describe("servers routes", () => {
  beforeEach(async () => {
    await cleanDb();
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("POST /api/servers", () => {
    it("creates a server with membership and a #general channel", async () => {
      const { cookie, userId } = await setupUser(app, "alice");
      const res = await createServer(cookie);

      expect(res.statusCode).toBe(201);
      const server = res.json();
      expect(server.name).toBe("Gaming");
      expect(server.ownerId).toBe(userId);
      expect(server.channels).toHaveLength(1);
      expect(server.channels[0].name).toBe("general");

      const membership = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId: server.id } },
      });
      expect(membership).not.toBeNull();
    });

    it("requires authentication (401)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/servers",
        headers: CLIENT_HEADERS,
        payload: { name: "Gaming" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /api/servers/mine", () => {
    it("lists my servers, not other users' servers", async () => {
      const alice = await setupUser(app, "alice");
      const bob = await setupUser(app, "bob");
      await createServer(alice.cookie, "Alice Club");
      await createServer(bob.cookie, "Bob Club");

      const res = await app.inject({
        method: "GET",
        url: "/api/servers/mine",
        cookies: { oda_session: alice.cookie },
      });
      expect(res.statusCode).toBe(200);
      const names = res.json().servers.map((s: { name: string }) => s.name);
      expect(names).toContain("Alice Club");
      expect(names).not.toContain("Bob Club");
    });
  });

  describe("PATCH /api/servers/:id", () => {
    it("owner can rename", async () => {
      const { cookie } = await setupUser(app, "alice");
      const server = (await createServer(cookie)).json();

      const res = await app.inject({
        method: "PATCH",
        url: `/api/servers/${server.id}`,
        headers: CLIENT_HEADERS,
        cookies: { oda_session: cookie },
        payload: { name: "Renamed" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe("Renamed");
    });

    it("member who is not owner gets 403", async () => {
      const alice = await setupUser(app, "alice");
      const bob = await setupUser(app, "bob");
      const server = (await createServer(alice.cookie)).json();
      await addMember(bob.userId, server.id);

      const res = await app.inject({
        method: "PATCH",
        url: `/api/servers/${server.id}`,
        headers: CLIENT_HEADERS,
        cookies: { oda_session: bob.cookie },
        payload: { name: "Hostile Takeover" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("non-member gets 404 (no existence leak)", async () => {
      const alice = await setupUser(app, "alice");
      const bob = await setupUser(app, "bob");
      const server = (await createServer(alice.cookie)).json();

      const res = await app.inject({
        method: "PATCH",
        url: `/api/servers/${server.id}`,
        headers: CLIENT_HEADERS,
        cookies: { oda_session: bob.cookie },
        payload: { name: "Sneak" },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/servers/:id", () => {
    it("owner can delete; channels and members cascade", async () => {
      const { cookie } = await setupUser(app, "alice");
      const server = (await createServer(cookie)).json();

      const res = await app.inject({
        method: "DELETE",
        url: `/api/servers/${server.id}`,
        headers: CLIENT_HEADERS,
        cookies: { oda_session: cookie },
      });
      expect(res.statusCode).toBe(204);

      expect(
        await prisma.server.findUnique({ where: { id: server.id } }),
      ).toBeNull();
      expect(
        await prisma.channel.count({ where: { serverId: server.id } }),
      ).toBe(0);
      expect(
        await prisma.serverMember.count({ where: { serverId: server.id } }),
      ).toBe(0);
    });

    it("non-owner member gets 403", async () => {
      const alice = await setupUser(app, "alice");
      const bob = await setupUser(app, "bob");
      const server = (await createServer(alice.cookie)).json();
      await addMember(bob.userId, server.id);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/servers/${server.id}`,
        headers: CLIENT_HEADERS,
        cookies: { oda_session: bob.cookie },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("GET /api/servers/:id/members", () => {
    it("returns member DTOs for a member", async () => {
      const alice = await setupUser(app, "alice");
      const bob = await setupUser(app, "bob");
      const server = (await createServer(alice.cookie)).json();
      await addMember(bob.userId, server.id);

      const res = await app.inject({
        method: "GET",
        url: `/api/servers/${server.id}/members`,
        cookies: { oda_session: bob.cookie },
      });
      expect(res.statusCode).toBe(200);
      const usernames = res
        .json()
        .members.map((m: { username: string }) => m.username)
        .sort();
      expect(usernames).toEqual(["alice", "bob"]);
    });

    it("rejects non-members with 404", async () => {
      const alice = await setupUser(app, "alice");
      const charlie = await setupUser(app, "charlie");
      const server = (await createServer(alice.cookie)).json();

      const res = await app.inject({
        method: "GET",
        url: `/api/servers/${server.id}/members`,
        cookies: { oda_session: charlie.cookie },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /api/servers/:id/channels", () => {
    it("owner creates a channel (defaults to text)", async () => {
      const { cookie } = await setupUser(app, "alice");
      const server = (await createServer(cookie)).json();

      const res = await app.inject({
        method: "POST",
        url: `/api/servers/${server.id}/channels`,
        headers: CLIENT_HEADERS,
        cookies: { oda_session: cookie },
        payload: { name: "memes" },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().type).toBe("text");
      expect(res.json().serverId).toBe(server.id);
    });

    it("rejects invalid channel names with 400", async () => {
      const { cookie } = await setupUser(app, "alice");
      const server = (await createServer(cookie)).json();

      const res = await app.inject({
        method: "POST",
        url: `/api/servers/${server.id}/channels`,
        headers: CLIENT_HEADERS,
        cookies: { oda_session: cookie },
        payload: { name: "No Spaces!" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("non-owner member gets 403", async () => {
      const alice = await setupUser(app, "alice");
      const bob = await setupUser(app, "bob");
      const server = (await createServer(alice.cookie)).json();
      await addMember(bob.userId, server.id);

      const res = await app.inject({
        method: "POST",
        url: `/api/servers/${server.id}/channels`,
        headers: CLIENT_HEADERS,
        cookies: { oda_session: bob.cookie },
        payload: { name: "sneaky" },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
