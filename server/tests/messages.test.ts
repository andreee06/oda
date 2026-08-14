import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { MessageDTO } from "@oda/shared";
import { prisma } from "../src/lib/db.js";
import { buildApp } from "../src/app.js";
import { addMember, cleanDb, setupUser } from "./helpers.js";

const CLIENT_HEADERS = { "x-oda-client": "web" };

let app: FastifyInstance;
const sockets: WebSocket[] = [];

/** Alice-owned server; returns alice's cookie + the #general channel id. */
async function setupChannel() {
  const alice = await setupUser(app, "alice");
  const res = await app.inject({
    method: "POST",
    url: "/api/servers",
    headers: CLIENT_HEADERS,
    cookies: { oda_session: alice.cookie },
    payload: { name: "Gaming" },
  });
  return { alice, channelId: res.json().channels[0].id as string };
}

function postMessage(cookie: string, channelId: string, content = "hello") {
  return app.inject({
    method: "POST",
    url: `/api/channels/${channelId}/messages`,
    headers: CLIENT_HEADERS,
    cookies: { oda_session: cookie },
    payload: { content },
  });
}

describe("messages routes", () => {
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

  describe("POST /api/channels/:id/messages", () => {
    it("creates a message and returns the DTO (201)", async () => {
      const { alice, channelId } = await setupChannel();
      const res = await postMessage(alice.cookie, channelId, "first!");

      expect(res.statusCode).toBe(201);
      const dto = res.json();
      expect(dto.content).toBe("first!");
      expect(dto.author.username).toBe("alice");
      expect(dto.channelId).toBe(channelId);
      expect(dto.editedAt).toBeNull();

      expect(await prisma.message.count({ where: { channelId } })).toBe(1);
    });

    it("any server member can post", async () => {
      const { alice, channelId } = await setupChannel();
      const bob = await setupUser(app, "bob");
      await addMember(bob.userId, (
        await prisma.channel.findUniqueOrThrow({ where: { id: channelId } })
      ).serverId);

      const res = await postMessage(bob.cookie, channelId, "bob says hi");
      expect(res.statusCode).toBe(201);
      void alice;
    });

    it("rejects non-members with 404", async () => {
      const { channelId } = await setupChannel();
      const charlie = await setupUser(app, "charlie");
      const res = await postMessage(charlie.cookie, channelId);
      expect(res.statusCode).toBe(404);
    });

    it("rejects unauthenticated (401) and empty content (400)", async () => {
      const { alice, channelId } = await setupChannel();
      const noAuth = await app.inject({
        method: "POST",
        url: `/api/channels/${channelId}/messages`,
        headers: CLIENT_HEADERS,
        payload: { content: "hi" },
      });
      expect(noAuth.statusCode).toBe(401);

      const empty = await postMessage(alice.cookie, channelId, "");
      expect(empty.statusCode).toBe(400);
    });

    it("broadcasts MESSAGE_CREATE to connected channel members", async () => {
      const { alice, channelId } = await setupChannel();
      const bob = await setupUser(app, "bob");
      await addMember(bob.userId, (
        await prisma.channel.findUniqueOrThrow({ where: { id: channelId } })
      ).serverId);

      await app.listen({ port: 0, host: "127.0.0.1" });
      const port = (app.server.address() as AddressInfo).port;
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
        headers: { cookie: `oda_session=${bob.cookie}` },
      });
      sockets.push(ws);
      await once(ws, "open");
      await once(ws, "message"); // consume READY

      await postMessage(alice.cookie, channelId, "realtime works");

      const [raw] = await once(ws, "message");
      const event = JSON.parse(raw.toString());
      expect(event.type).toBe("MESSAGE_CREATE");
      expect(event.data.content).toBe("realtime works");
      expect(event.data.author.username).toBe("alice");
    });
  });

  describe("GET /api/channels/:id/messages", () => {
    async function seedMessages(channelId: string, authorId: string, n: number) {
      for (let i = 0; i < n; i++) {
        await prisma.message.create({
          data: { channelId, authorId, content: `msg-${String(i).padStart(3, "0")}` },
        });
        // distinct createdAt values even on fast machines
        await new Promise((r) => setTimeout(r, 2));
      }
    }

    it("paginates newest-first with a cursor (default 50)", async () => {
      const { alice, channelId } = await setupChannel();
      await seedMessages(channelId, alice.userId, 60);

      const page1 = await app.inject({
        method: "GET",
        url: `/api/channels/${channelId}/messages`,
        cookies: { oda_session: alice.cookie },
      });
      expect(page1.statusCode).toBe(200);
      const body1 = page1.json();
      expect(body1.messages).toHaveLength(50);
      expect(body1.nextCursor).not.toBeNull();
      const contents1 = body1.messages.map((m: MessageDTO) => m.content);
      expect(contents1[0]).toBe("msg-059"); // newest first
      expect(contents1[49]).toBe("msg-010");

      const page2 = await app.inject({
        method: "GET",
        url: `/api/channels/${channelId}/messages?before=${body1.nextCursor}`,
        cookies: { oda_session: alice.cookie },
      });
      const body2 = page2.json();
      expect(body2.messages).toHaveLength(10);
      expect(body2.messages[0].content).toBe("msg-009");
      expect(body2.nextCursor).toBeNull();
    });

    it("respects the limit param", async () => {
      const { alice, channelId } = await setupChannel();
      await seedMessages(channelId, alice.userId, 5);
      const res = await app.inject({
        method: "GET",
        url: `/api/channels/${channelId}/messages?limit=3`,
        cookies: { oda_session: alice.cookie },
      });
      expect(res.json().messages).toHaveLength(3);
      expect(res.json().nextCursor).not.toBeNull();
    });

    it("rejects a bogus cursor with 400", async () => {
      const { alice, channelId } = await setupChannel();
      const res = await app.inject({
        method: "GET",
        url: `/api/channels/${channelId}/messages?before=does-not-exist`,
        cookies: { oda_session: alice.cookie },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects non-members with 404", async () => {
      const { channelId } = await setupChannel();
      const charlie = await setupUser(app, "charlie");
      const res = await app.inject({
        method: "GET",
        url: `/api/channels/${channelId}/messages`,
        cookies: { oda_session: charlie.cookie },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
