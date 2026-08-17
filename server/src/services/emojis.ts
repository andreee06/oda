import type { CreateEmojiBody, EmojiDTO } from "@oda/shared";
import { prisma } from "../lib/db.js";
import { ApiError } from "../lib/errors.js";
import { toEmojiDTO } from "../lib/dto.js";
import { getServerForMember, requireOwner } from "./servers.js";

export async function createEmoji(
  userId: string,
  serverId: string,
  body: CreateEmojiBody,
): Promise<EmojiDTO> {
  const server = await getServerForMember(serverId, userId);
  requireOwner(server, userId);

  const exists = await prisma.emoji.findUnique({
    where: { serverId_name: { serverId, name: body.name } },
  });
  if (exists) throw new ApiError(409, "emoji name already taken");

  const emoji = await prisma.emoji.create({
    data: {
      serverId,
      name: body.name,
      imageUrl: body.imageUrl,
      uploaderId: userId,
    },
  });
  return toEmojiDTO(emoji);
}

export async function listEmojis(
  userId: string,
  serverId: string,
): Promise<EmojiDTO[]> {
  await getServerForMember(serverId, userId); // 404 for non-members
  const emojis = await prisma.emoji.findMany({
    where: { serverId },
    orderBy: { createdAt: "asc" },
  });
  return emojis.map(toEmojiDTO);
}
