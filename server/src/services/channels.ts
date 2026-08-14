import type { ChannelDTO, CreateChannelBody } from "@oda/shared";
import { prisma } from "../lib/db.js";
import { ApiError } from "../lib/errors.js";
import { toChannelDTO } from "../lib/dto.js";
import { getServerForMember, requireOwner } from "./servers.js";

async function getChannelForOwner(channelId: string, userId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { server: true },
  });
  if (!channel) throw new ApiError(404, "channel not found");
  await getServerForMember(channel.serverId, userId); // 404 for non-members
  requireOwner(channel.server, userId);
  return channel;
}

export async function createChannel(
  userId: string,
  serverId: string,
  body: CreateChannelBody,
): Promise<ChannelDTO> {
  const server = await getServerForMember(serverId, userId);
  requireOwner(server, userId);
  const channel = await prisma.channel.create({
    data: { serverId, name: body.name, type: body.type },
  });
  return toChannelDTO(channel);
}

export async function renameChannel(
  userId: string,
  channelId: string,
  name: string,
): Promise<ChannelDTO> {
  const channel = await getChannelForOwner(channelId, userId);
  const updated = await prisma.channel.update({
    where: { id: channel.id },
    data: { name },
  });
  return toChannelDTO(updated);
}

export async function deleteChannel(
  userId: string,
  channelId: string,
): Promise<void> {
  const channel = await getChannelForOwner(channelId, userId);
  await prisma.channel.delete({ where: { id: channel.id } });
}

/** Owner-check + return the channel's serverId (needed to dispatch the event). */
export async function getChannelServerId(
  userId: string,
  channelId: string,
): Promise<string> {
  const channel = await getChannelForOwner(channelId, userId);
  return channel.serverId;
}
