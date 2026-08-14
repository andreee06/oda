import type { ChannelDTO, MessageDTO, UserDTO } from "@oda/shared";
import type {
  ChannelModel,
  MessageModel,
  UserModel,
} from "../generated/prisma/models.js";

/** Prisma model → wire DTO. Central place so shape changes happen once. */
export function toUserDTO(user: UserModel): UserDTO {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}

export function toChannelDTO(channel: ChannelModel): ChannelDTO {
  return {
    id: channel.id,
    serverId: channel.serverId,
    name: channel.name,
    // channel.type is a free string in the DB; zod-validated at write time.
    type: channel.type === "voice" ? "voice" : "text",
  };
}

export function toMessageDTO(
  message: MessageModel & { author: UserModel },
): MessageDTO {
  return {
    id: message.id,
    channelId: message.channelId,
    author: toUserDTO(message.author),
    content: message.content,
    editedAt: message.editedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}
