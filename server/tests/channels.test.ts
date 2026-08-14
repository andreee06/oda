import type { FastifyInstance } from "fastify";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/db.js";
import { buildApp } from "../src/app.js";
import { addMember, cleanDb, setupUser } from "./helpers.js";

const CLIENT_HEADERS = { "x-oda-client": "web" };

let app: FastifyInstance;

/** Alice-owned server with its default #general channel. */
async function setupServerWithChannel() {
  const alice = await setupUser(app, "alice");
  const res = await app.inject({
    method: "POST",
    url: "/api/servers",
    headers: CLIENT_HEADERS,
    cookies: { oda_session: alice.cookie },
    payload: { name: "Gaming" },
  });
  const server = res.json();
  return { alice, server, channel: server.channels[0] };
}

describe("channels routes", () => {
  beforeEach(async () => {
    await cleanDb();
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("PATCH /api/channels/:id", () => {
    it("owner renames a channel", async () => {
      const { alice, channel } = await setupServerWithChannel();
      const res = await app.inject({
        method: "PATCH",
        url: `/api/channels/${channel.id}`,
        headers: CLIENT_HEADERS,
        cookies: { oda_session: alice.cookie },
        payload: { name: "general-chat" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe("general-chat");
    });

    it("non-owner member gets 403", async () => {
      const { server, channel } = await setupServerWithChannel();
      const bob = await setupUser(app, "bob");
      await addMember(bob.userId, server.id);

      const res = await app.inject({
        method: "PATCH",
        url: `/api/channels/${channel.id}`,
        headers: CLIENT_HEADERS,
        cookies: { oda_session: bob.cookie },
        payload: { name: "hacked" },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("DELETE /api/channels/:id", () => {
    it("owner deletes a channel", async () => {
      const { alice, channel } = await setupServerWithChannel();
      const res = await app.inject({
        method: "DELETE",
        url: `/api/channels/${channel.id}`,
        headers: CLIENT_HEADERS,
        cookies: { oda_session: alice.cookie },
      });
      expect(res.statusCode).toBe(204);
      expect(
        await prisma.channel.findUnique({ where: { id: channel.id } }),
      ).toBeNull();
    });

    it("non-owner member gets 403", async () => {
      const { server, channel } = await setupServerWithChannel();
      const bob = await setupUser(app, "bob");
      await addMember(bob.userId, server.id);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/channels/${channel.id}`,
        headers: CLIENT_HEADERS,
        cookies: { oda_session: bob.cookie },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
