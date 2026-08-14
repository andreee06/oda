import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import type {
  MeResponse,
  RegisterBody,
  ServerWithChannelsDTO,
} from "@oda/shared";
import { prisma } from "../lib/db.js";
import { ApiError } from "../lib/errors.js";
import { toChannelDTO, toUserDTO } from "../lib/dto.js";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_COOKIE = "oda_session";

// ---------- registration ----------

export async function register(body: RegisterBody) {
  const invite = await prisma.invite.findUnique({
    where: { code: body.inviteCode },
  });
  const expired = invite?.expiresAt && invite.expiresAt < new Date();
  if (!invite || invite.uses >= invite.maxUses || expired) {
    throw new ApiError(403, "invalid or exhausted invite code");
  }

  const taken = await prisma.user.findUnique({
    where: { username: body.username },
  });
  if (taken) throw new ApiError(409, "username already taken");

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: body.username,
        displayName: body.displayName,
        passwordHash: await hash(body.password),
      },
    });
    await tx.invite.update({
      where: { code: invite.code },
      data: { uses: { increment: 1 } },
    });
    // v1 simplification: every new account auto-joins the oldest server.
    // Real per-server invite links land in slice 3 (needs Invite.serverId).
    const defaultServer = await tx.server.findFirst({
      orderBy: { createdAt: "asc" },
    });
    if (defaultServer) {
      await tx.serverMember.create({
        data: { userId: user.id, serverId: defaultServer.id },
      });
    }
    return user;
  });
}

// ---------- login (rate-limited) ----------

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000;
// In-memory fixed-window limiter — fine for one process (SPEC v1, no Redis).
const attempts = new Map<string, { count: number; resetAt: number }>();

function recordFailure(key: string, now: number): void {
  const rec = attempts.get(key);
  if (!rec || rec.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    rec.count += 1;
  }
}

export async function login(username: string, password: string, ip: string) {
  const key = `${ip}|${username}`;
  const now = Date.now();
  const rec = attempts.get(key);
  if (rec && rec.resetAt > now && rec.count >= MAX_ATTEMPTS) {
    throw new ApiError(429, "too many attempts — try again later");
  }

  const user = await prisma.user.findUnique({ where: { username } });
  const ok =
    user !== null &&
    (await verify(user.passwordHash, password).catch(() => false));
  if (!ok) {
    recordFailure(key, now);
    throw new ApiError(401, "invalid credentials");
  }

  attempts.delete(key);
  return user;
}

// ---------- sessions ----------

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      token,
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
}

export async function getSessionUser(token: string | undefined) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

// ---------- me ----------

export async function getMe(userId: string): Promise<MeResponse> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const memberships = await prisma.serverMember.findMany({
    where: { userId },
    include: { server: { include: { channels: true } } },
  });
  const servers: ServerWithChannelsDTO[] = memberships.map((m) => ({
    id: m.server.id,
    name: m.server.name,
    iconUrl: m.server.iconUrl,
    ownerId: m.server.ownerId,
    channels: m.server.channels.map(toChannelDTO),
  }));
  return { user: toUserDTO(user), servers };
}
