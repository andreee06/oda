import { randomBytes } from "node:crypto";
import type {
  CreateInviteBody,
  InviteDTO,
  InvitePreviewDTO,
  ServerWithChannelsDTO,
} from "@oda/shared";
import type { InviteModel } from "../generated/prisma/models.js";
import { prisma } from "../lib/db.js";
import { ApiError } from "../lib/errors.js";
import { toChannelDTO } from "../lib/dto.js";
import { getServerForMember, requireOwner } from "./servers.js";

function toInviteDTO(invite: InviteModel): InviteDTO {
  return {
    code: invite.code,
    serverId: invite.serverId,
    maxUses: invite.maxUses,
    uses: invite.uses,
    expiresAt: invite.expiresAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
  };
}

/** A usable invite: exists, server-bound, not exhausted, not expired. */
async function getUsableInvite(code: string) {
  const invite = await prisma.invite.findUnique({
    where: { code },
    include: { server: { include: { channels: true, _count: { select: { members: true } } } } },
  });
  const expired = invite?.expiresAt && invite.expiresAt < new Date();
  if (!invite || !invite.server || invite.uses >= invite.maxUses || expired) {
    throw new ApiError(404, "invite not found");
  }
  return invite;
}

export async function createInvite(
  userId: string,
  serverId: string,
  body: CreateInviteBody,
): Promise<InviteDTO> {
  const server = await getServerForMember(serverId, userId); // 404 non-member
  requireOwner(server, userId); // 403 member-but-not-owner

  const invite = await prisma.invite.create({
    data: {
      code: `oda-${randomBytes(4).toString("hex")}`,
      creatorId: userId,
      serverId,
      maxUses: body.maxUses,
      expiresAt: body.expiresInHours
        ? new Date(Date.now() + body.expiresInHours * 3_600_000)
        : null,
    },
  });
  return toInviteDTO(invite);
}

export async function listInvites(
  userId: string,
  serverId: string,
): Promise<InviteDTO[]> {
  const server = await getServerForMember(serverId, userId);
  requireOwner(server, userId);
  const invites = await prisma.invite.findMany({
    where: { serverId },
    orderBy: { createdAt: "desc" },
  });
  return invites.map(toInviteDTO);
}

export async function revokeInvite(
  userId: string,
  serverId: string,
  code: string,
): Promise<void> {
  const server = await getServerForMember(serverId, userId);
  requireOwner(server, userId);
  const { count } = await prisma.invite.deleteMany({
    where: { code, serverId },
  });
  if (count === 0) throw new ApiError(404, "invite not found");
}

export async function previewInvite(code: string): Promise<InvitePreviewDTO> {
  const invite = await getUsableInvite(code);
  return {
    code: invite.code,
    server: {
      id: invite.server!.id,
      name: invite.server!.name,
      iconUrl: invite.server!.iconUrl,
      ownerId: invite.server!.ownerId,
    },
    memberCount: invite.server!._count.members,
  };
}

export async function acceptInvite(
  userId: string,
  code: string,
): Promise<ServerWithChannelsDTO> {
  const invite = await prisma.invite.findUnique({
    where: { code },
    include: { server: { include: { channels: true } } },
  });
  if (!invite || !invite.server) throw new ApiError(404, "invite not found");
  // unlike preview (404, no existence leak), accept says WHY it failed
  const expired = invite.expiresAt && invite.expiresAt < new Date();
  if (invite.uses >= invite.maxUses || expired) {
    throw new ApiError(403, "invite exhausted or expired");
  }
  const server = invite.server;

  const existing = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: server.id } },
  });
  if (existing) throw new ApiError(409, "already a member");

  await prisma.$transaction([
    prisma.serverMember.create({ data: { userId, serverId: server.id } }),
    prisma.invite.update({
      where: { code: invite.code },
      data: { uses: { increment: 1 } },
    }),
  ]);

  return {
    id: server.id,
    name: server.name,
    iconUrl: server.iconUrl,
    ownerId: server.ownerId,
    channels: server.channels.map(toChannelDTO),
  };
}
