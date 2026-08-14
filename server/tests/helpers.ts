import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/db.js";

const CLIENT_HEADERS = { "x-oda-client": "web" };

/** Truncate every table. Order irrelevant — CASCADE handles FKs. */
export async function cleanDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "messages", "channels", "server_members", "servers", "sessions", "invites", "users" CASCADE',
  );
}

/** Base fixture: one server + one usable invite (what registration needs). */
export async function seedInviteAndServer(): Promise<{
  inviteCode: string;
  serverId: string;
}> {
  const owner = await prisma.user.create({
    data: {
      username: `fixture-owner-${crypto.randomUUID().slice(0, 8)}`,
      displayName: "Fixture Owner",
      passwordHash: "not-a-real-hash",
    },
  });
  const server = await prisma.server.create({
    data: { name: "Fixture Server", ownerId: owner.id },
  });
  const invite = await prisma.invite.create({
    data: {
      code: `test-invite-${crypto.randomUUID().slice(0, 8)}`,
      creatorId: owner.id,
      maxUses: 10,
    },
  });
  return { inviteCode: invite.code, serverId: server.id };
}

/** Register a fresh user and return their session cookie + user DTO. */
export async function setupUser(
  app: FastifyInstance,
  username: string,
): Promise<{ cookie: string; userId: string }> {
  const { inviteCode } = await seedInviteAndServer();
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: CLIENT_HEADERS,
    payload: {
      username,
      displayName: username,
      password: "super-secret-1",
      inviteCode,
    },
  });
  if (res.statusCode !== 201) {
    throw new Error(`setupUser(${username}) failed: ${res.statusCode} ${res.body}`);
  }
  const cookie = res.cookies.find((c) => c.name === "oda_session");
  if (!cookie) throw new Error("no session cookie on register");
  return { cookie: cookie.value, userId: res.json().user.id };
}

/** Make `userId` a plain member of `serverId` (bypasses invite flow). */
export async function addMember(userId: string, serverId: string): Promise<void> {
  await prisma.serverMember.create({ data: { userId, serverId } });
}
