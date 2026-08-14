import { z } from "zod";

/**
 * @oda/shared — the single contract between client and server.
 * Server validates requests with these schemas AND emits events typed by them;
 * the client parses incoming events with the same schemas. No drift possible.
 */

// ---------- primitives ----------

export const Id = z.string().min(1);
export const ChannelType = z.enum(["text", "voice"]);
export type ChannelType = z.infer<typeof ChannelType>;

// ---------- DTOs ----------

export const UserDTO = z.object({
  id: Id,
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});
export type UserDTO = z.infer<typeof UserDTO>;

export const ServerDTO = z.object({
  id: Id,
  name: z.string(),
  iconUrl: z.string().nullable(),
  ownerId: Id,
});
export type ServerDTO = z.infer<typeof ServerDTO>;

export const ChannelDTO = z.object({
  id: Id,
  serverId: Id,
  name: z.string(),
  type: ChannelType,
});
export type ChannelDTO = z.infer<typeof ChannelDTO>;

export const ServerWithChannelsDTO = ServerDTO.extend({
  channels: z.array(ChannelDTO),
});
export type ServerWithChannelsDTO = z.infer<typeof ServerWithChannelsDTO>;

export const MessageDTO = z.object({
  id: Id,
  channelId: Id,
  author: UserDTO,
  content: z.string(),
  editedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(), // serialized via Date.toISOString()
});
export type MessageDTO = z.infer<typeof MessageDTO>;

export const MeResponse = z.object({
  user: UserDTO,
  servers: z.array(ServerWithChannelsDTO),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const MessagePage = z.object({
  messages: z.array(MessageDTO),
  nextCursor: Id.nullable(),
});
export type MessagePage = z.infer<typeof MessagePage>;

// ---------- REST request bodies / queries ----------

export const RegisterBody = z.object({
  username: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9_.-]+$/, "lowercase letters, digits, _ . - only"),
  displayName: z.string().min(1).max(64),
  password: z.string().min(8).max(128),
  inviteCode: z.string().min(1),
});
export type RegisterBody = z.infer<typeof RegisterBody>;

export const LoginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginBody = z.infer<typeof LoginBody>;

export const CreateServerBody = z.object({
  name: z.string().min(1).max(64),
});
export type CreateServerBody = z.infer<typeof CreateServerBody>;

export const CreateChannelBody = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9-]{1,32}$/, "lowercase letters, digits, hyphens only"),
  type: ChannelType.default("text"),
});
export type CreateChannelBody = z.infer<typeof CreateChannelBody>;

export const CreateMessageBody = z.object({
  content: z.string().min(1).max(4000),
});
export type CreateMessageBody = z.infer<typeof CreateMessageBody>;

export const RenameChannelBody = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9-]{1,32}$/, "lowercase letters, digits, hyphens only"),
});
export type RenameChannelBody = z.infer<typeof RenameChannelBody>;

export const GetMessagesQuery = z.object({
  before: Id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type GetMessagesQuery = z.infer<typeof GetMessagesQuery>;

// ---------- WebSocket events (server → client) ----------

export const WsEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("READY"),
    data: z.object({ user: UserDTO, servers: z.array(ServerWithChannelsDTO) }),
  }),
  z.object({ type: z.literal("MESSAGE_CREATE"), data: MessageDTO }),
  z.object({ type: z.literal("CHANNEL_CREATE"), data: ChannelDTO }),
  z.object({
    type: z.literal("CHANNEL_DELETE"),
    data: z.object({ id: Id, serverId: Id }),
  }),
  z.object({ type: z.literal("SERVER_CREATE"), data: ServerWithChannelsDTO }),
  z.object({ type: z.literal("PONG"), data: z.object({}).strict() }),
]);
export type WsEvent = z.infer<typeof WsEvent>;

// ---------- WebSocket messages (client → server) ----------

export const WsClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PING") }),
]);
export type WsClientMessage = z.infer<typeof WsClientMessage>;
