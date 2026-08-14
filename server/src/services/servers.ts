import type { ServerWithChannelsDTO, UserDTO } from "@oda/shared";
import type { ChannelModel, ServerModel } from "../generated/prisma/models.js";
import { prisma } from "../lib/db.js";
import { ApiError } from "../lib/errors.js";
import { toChannelDTO, toUserDTO } from "../lib/dto.js";

/** Fetch a server the user belongs to — 404 for non-members (no existence leak). */
export async function getServerForMember(serverId: string, userId: string) {
  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId } },
    include: { server: true },
  });
  if (!membership) throw new ApiError(404, "server not found");
  return membership.server;
}

export function requireOwner(server: ServerModel, userId: string): void {
  if (server.ownerId !== userId) throw new ApiError(403, "owner only");
}

type ServerWithChannels = ServerModel & { channels: ChannelModel[] };

function toServerWithChannelsDTO(server: ServerWithChannels): ServerWithChannelsDTO {
  return {
    id: server.id,
    name: server.name,
    iconUrl: server.iconUrl,
    ownerId: server.ownerId,
    channels: server.channels.map(toChannelDTO),
  };
}

export async function createServer(
  userId: string,
  name: string,
): Promise<ServerWithChannelsDTO> {
  const server = await prisma.server.create({
    data: {
      name,
      ownerId: userId,
      members: { create: { userId } },
      channels: { create: { name: "general", type: "text" } },
    },
    include: { channels: true },
  });
  return toServerWithChannelsDTO(server);
}

export async function listMyServers(
  userId: string,
): Promise<ServerWithChannelsDTO[]> {
  const memberships = await prisma.serverMember.findMany({
    where: { userId },
    include: { server: { include: { channels: true } } },
    orderBy: { joinedAt: "asc" },
  });
  return memberships.map((m) => toServerWithChannelsDTO(m.server));
}

export async function renameServer(
  userId: string,
  serverId: string,
  name: string,
): Promise<ServerWithChannelsDTO> {
  const server = await getServerForMember(serverId, userId);
  requireOwner(server, userId);
  const updated = await prisma.server.update({
    where: { id: serverId },
    data: { name },
    include: { channels: true },
  });
  return toServerWithChannelsDTO(updated);
}

export async function listMembers(
  userId: string,
  serverId: string,
): Promise<UserDTO[]> {
  await getServerForMember(serverId, userId); // 404 for non-members
  const members = await prisma.serverMember.findMany({
    where: { serverId },
    include: { user: true },
    orderBy: { joinedAt: "asc" },
  });
  return members.map((m) => toUserDTO(m.user));
}

export async function deleteServer(
  userId: string,
  serverId: string,
): Promise<void> {
  const server = await getServerForMember(serverId, userId);
  requireOwner(server, userId);
  await prisma.server.delete({ where: { id: serverId } });
}
