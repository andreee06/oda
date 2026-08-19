import type { FastifyInstance } from "fastify";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/db.js";
import { buildApp } from "../src/app.js";
import { addMember, cleanDb, setupUser } from "./helpers.js";

const CLIENT_HEADERS = { "x-oda-client": "web" };

let app: FastifyInstance;

async function createServerAs(cookie: string, name: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/servers",
    headers: CLIENT_HEADERS,
    cookies: { oda_session: cookie },
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; channels: { id: string }[] };
}

async function createInvite(cookie: string, serverId: string, body = {}) {
  return app.inject({
    method: "POST",
    url: `/api/servers/${serverId}/invites`,
    headers: CLIENT_HEADERS,
    cookies: { oda_session: cookie },
    payload: body,
  });
}

describe("invites (slice 3)", () => {
  beforeEach(async () => {
    await cleanDb();
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("owner creates an invite bound to the server (defaults: 10 uses, 7 days)", async () => {
    const alice = await setupUser(app, "alice");
    const server = await createServerAs(alice.cookie, "Clubhouse");

    const res = await createInvite(alice.cookie, server.id);
    expect(res.statusCode).toBe(201);
    const invite = res.json();
    expect(invite.code).toMatch(/^oda-/);
    expect(invite.serverId).toBe(server.id);
    expect(invite.maxUses).toBe(10);
    expect(invite.uses).toBe(0);
    expect(new Date(invite.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("members get 403, outsiders get 404 on create", async () => {
    const alice = await setupUser(app, "alice");
    const bob = await setupUser(app, "bob");
    const eve = await setupUser(app, "eve");
    const server = await createServerAs(alice.cookie, "Clubhouse");
    await addMember(bob.userId, server.id);

    expect((await createInvite(bob.cookie, server.id)).statusCode).toBe(403);
    expect((await createInvite(eve.cookie, server.id)).statusCode).toBe(404);
  });

  it("owner lists and revokes invites", async () => {
    const alice = await setupUser(app, "alice");
    const bob = await setupUser(app, "bob");
    const server = await createServerAs(alice.cookie, "Clubhouse");
    await addMember(bob.userId, server.id);

    await createInvite(alice.cookie, server.id);
    const second = await createInvite(alice.cookie, server.id, { maxUses: 1 });

    const list = await app.inject({
      method: "GET",
      url: `/api/servers/${server.id}/invites`,
      cookies: { oda_session: alice.cookie },
    });
    expect(list.json().invites).toHaveLength(2);

    // member cannot revoke
    const denied = await app.inject({
      method: "DELETE",
      url: `/api/servers/${server.id}/invites/${second.json().code}`,
      headers: CLIENT_HEADERS,
      cookies: { oda_session: bob.cookie },
    });
    expect(denied.statusCode).toBe(403);

    const revoked = await app.inject({
      method: "DELETE",
      url: `/api/servers/${server.id}/invites/${second.json().code}`,
      headers: CLIENT_HEADERS,
      cookies: { oda_session: alice.cookie },
    });
    expect(revoked.statusCode).toBe(204);

    const after = await app.inject({
      method: "GET",
      url: `/api/servers/${server.id}/invites`,
      cookies: { oda_session: alice.cookie },
    });
    expect(after.json().invites).toHaveLength(1);
  });

  it("preview shows server name + member count to any logged-in user", async () => {
    const alice = await setupUser(app, "alice");
    const bob = await setupUser(app, "bob");
    const server = await createServerAs(alice.cookie, "Clubhouse");
    const code = (await createInvite(alice.cookie, server.id)).json().code;

    const res = await app.inject({
      method: "GET",
      url: `/api/invites/${code}`,
      cookies: { oda_session: bob.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().server.name).toBe("Clubhouse");
    expect(res.json().memberCount).toBe(1);

    const bogus = await app.inject({
      method: "GET",
      url: "/api/invites/oda-nope",
      cookies: { oda_session: bob.cookie },
    });
    expect(bogus.statusCode).toBe(404);
  });

  it("register with a server-bound invite joins THAT server, not the oldest", async () => {
    const alice = await setupUser(app, "alice"); // creates the oldest fixture server
    const server = await createServerAs(alice.cookie, "Clubhouse");
    const code = (await createInvite(alice.cookie, server.id)).json().code;

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: CLIENT_HEADERS,
      payload: {
        username: "eve",
        displayName: "eve",
        password: "super-secret-1",
        inviteCode: code,
      },
    });
    expect(res.statusCode).toBe(201);
    const cookie = res.cookies.find((c) => c.name === "oda_session")!.value;

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { oda_session: cookie },
    });
    const names = me.json().servers.map((s: { name: string }) => s.name);
    expect(names).toEqual(["Clubhouse"]);
  });

  it("accept adds a logged-in user to the server and counts a use", async () => {
    const alice = await setupUser(app, "alice");
    const bob = await setupUser(app, "bob");
    const server = await createServerAs(alice.cookie, "Clubhouse");
    const code = (await createInvite(alice.cookie, server.id)).json().code;

    const res = await app.inject({
      method: "POST",
      url: `/api/invites/${code}/accept`,
      headers: CLIENT_HEADERS,
      cookies: { oda_session: bob.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Clubhouse");
    expect(res.json().channels.length).toBeGreaterThan(0);

    const list = await app.inject({
      method: "GET",
      url: `/api/servers/${server.id}/invites`,
      cookies: { oda_session: alice.cookie },
    });
    expect(list.json().invites[0].uses).toBe(1);

    // double-join → 409
    const again = await app.inject({
      method: "POST",
      url: `/api/invites/${code}/accept`,
      headers: CLIENT_HEADERS,
      cookies: { oda_session: bob.cookie },
    });
    expect(again.statusCode).toBe(409);

    // and bob sees the server now
    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { oda_session: bob.cookie },
    });
    const names = me.json().servers.map((s: { name: string }) => s.name);
    expect(names).toContain("Clubhouse");
  });

  it("exhausted invites are rejected on preview and accept", async () => {
    const alice = await setupUser(app, "alice");
    const bob = await setupUser(app, "bob");
    const carol = await setupUser(app, "carol");
    const server = await createServerAs(alice.cookie, "Clubhouse");
    const code = (await createInvite(alice.cookie, server.id, { maxUses: 1 })).json()
      .code;

    const ok = await app.inject({
      method: "POST",
      url: `/api/invites/${code}/accept`,
      headers: CLIENT_HEADERS,
      cookies: { oda_session: bob.cookie },
    });
    expect(ok.statusCode).toBe(200);

    const late = await app.inject({
      method: "POST",
      url: `/api/invites/${code}/accept`,
      headers: CLIENT_HEADERS,
      cookies: { oda_session: carol.cookie },
    });
    expect(late.statusCode).toBe(403);

    const preview = await app.inject({
      method: "GET",
      url: `/api/invites/${code}`,
      cookies: { oda_session: carol.cookie },
    });
    expect(preview.statusCode).toBe(404);
  });

  it("accept requires auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/invites/whatever/accept",
      headers: CLIENT_HEADERS,
    });
    expect(res.statusCode).toBe(401);
  });
});
