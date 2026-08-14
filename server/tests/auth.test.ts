import type { FastifyInstance } from "fastify";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/db.js";
import { buildApp } from "../src/app.js";
import { cleanDb, seedInviteAndServer } from "./helpers.js";

const CLIENT_HEADERS = { "x-oda-client": "web" };

let app: FastifyInstance;

async function registerUser(
  overrides: Partial<{
    username: string;
    password: string;
  }> & { inviteCode: string },
) {
  return app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: CLIENT_HEADERS,
    payload: {
      username: overrides.username ?? "alice",
      displayName: "Alice",
      password: overrides.password ?? "super-secret-1",
      inviteCode: overrides.inviteCode,
    },
  });
}

describe("auth routes", () => {
  beforeEach(async () => {
    await cleanDb();
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("POST /api/auth/register", () => {
    it("creates a user with a valid invite and sets an httpOnly session cookie", async () => {
      const { inviteCode, serverId } = await seedInviteAndServer();
      const res = await registerUser({ inviteCode });

      expect(res.statusCode).toBe(201);
      expect(res.json().user.username).toBe("alice");

      const cookie = res.cookies.find((c) => c.name === "oda_session");
      expect(cookie).toBeDefined();
      expect(cookie!.httpOnly).toBe(true);
      expect(cookie!.value.length).toBeGreaterThan(20);

      // auto-joined the default server (v1 simplification)
      const membership = await prisma.serverMember.findFirst({
        where: { serverId },
      });
      expect(membership).not.toBeNull();
    });

    it("rejects an unknown invite code with 403", async () => {
      await seedInviteAndServer();
      const res = await registerUser({ inviteCode: "nope" });
      expect(res.statusCode).toBe(403);
    });

    it("rejects an exhausted invite code with 403", async () => {
      const { inviteCode } = await seedInviteAndServer();
      await prisma.invite.update({
        where: { code: inviteCode },
        data: { maxUses: 2 },
      });
      await registerUser({ username: "u1", inviteCode });
      await registerUser({ username: "u2", inviteCode });
      const third = await registerUser({ username: "u3", inviteCode });
      expect(third.statusCode).toBe(403);
    });

    it("rejects a duplicate username with 409", async () => {
      const { inviteCode } = await seedInviteAndServer();
      await registerUser({ username: "alice", inviteCode });
      const res = await registerUser({ username: "alice", inviteCode });
      expect(res.statusCode).toBe(409);
    });

    it("rejects invalid bodies with 400", async () => {
      await seedInviteAndServer();
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: CLIENT_HEADERS,
        payload: { username: "Bad Name!", password: "x" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      const { inviteCode } = await seedInviteAndServer();
      await registerUser({ inviteCode });
    });

    it("logs in with correct credentials", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: CLIENT_HEADERS,
        payload: { username: "alice", password: "super-secret-1" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.cookies.some((c) => c.name === "oda_session")).toBe(true);
    });

    it("rejects wrong password with 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: CLIENT_HEADERS,
        payload: { username: "alice", password: "wrong-password" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rate-limits after 5 failed attempts (429)", async () => {
      for (let i = 0; i < 5; i++) {
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: CLIENT_HEADERS,
          payload: { username: "ratelimit-victim", password: "wrong" },
        });
      }
      const sixth = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: CLIENT_HEADERS,
        payload: { username: "ratelimit-victim", password: "wrong" },
      });
      expect(sixth.statusCode).toBe(429);
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns 401 without a session cookie", async () => {
      const res = await app.inject({ method: "GET", url: "/api/auth/me" });
      expect(res.statusCode).toBe(401);
    });

    it("returns user + servers with a valid session", async () => {
      const { inviteCode } = await seedInviteAndServer();
      const register = await registerUser({ inviteCode });
      const cookie = register.cookies.find((c) => c.name === "oda_session")!;

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        cookies: { oda_session: cookie.value },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user.username).toBe("alice");
      expect(body.servers).toHaveLength(1);
      expect(body.servers[0].name).toBe("Fixture Server");
    });
  });

  describe("POST /api/auth/logout", () => {
    it("destroys the session", async () => {
      const { inviteCode } = await seedInviteAndServer();
      const register = await registerUser({ inviteCode });
      const cookie = register.cookies.find((c) => c.name === "oda_session")!;

      const logout = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: CLIENT_HEADERS,
        cookies: { oda_session: cookie.value },
      });
      expect(logout.statusCode).toBe(204);

      const me = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        cookies: { oda_session: cookie.value },
      });
      expect(me.statusCode).toBe(401);
    });
  });

  describe("CSRF guard", () => {
    it("rejects mutating requests without the client header", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {},
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
