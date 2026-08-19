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

export const AttachmentDTO = z.object({
  url: z.string(),
});
export type AttachmentDTO = z.infer<typeof AttachmentDTO>;

export const EmbedDTO = z.object({
  url: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
});
export type EmbedDTO = z.infer<typeof EmbedDTO>;

export const EmojiDTO = z.object({
  id: Id,
  serverId: Id,
  name: z.string(),
  imageUrl: z.string(),
});
export type EmojiDTO = z.infer<typeof EmojiDTO>;

export const MessageDTO = z.object({
  id: Id,
  channelId: Id,
  author: UserDTO,
  content: z.string(),
  // .default([]) keeps old fixtures/clients working; server always sends them
  attachments: z.array(AttachmentDTO).default([]),
  embeds: z.array(EmbedDTO).default([]),
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
  attachmentUrls: z.array(z.string()).max(10).optional(),
});
export type CreateMessageBody = z.infer<typeof CreateMessageBody>;

export const SetAvatarBody = z.object({
  avatarUrl: z.string().regex(/^\/media\//, "must be an uploaded /media path"),
});
export type SetAvatarBody = z.infer<typeof SetAvatarBody>;

export const CreateEmojiBody = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9_]{2,32}$/, "lowercase letters, digits, underscores"),
  imageUrl: z.string().regex(/^\/media\//, "must be an uploaded /media path"),
});
export type CreateEmojiBody = z.infer<typeof CreateEmojiBody>;

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

export const GifResultDTO = z.object({
  id: z.string(),
  url: z.string(), // full-size gif
  previewUrl: z.string(), // tiny preview for the picker grid
});
export type GifResultDTO = z.infer<typeof GifResultDTO>;

export const GifSearchResponse = z.object({
  results: z.array(GifResultDTO),
});
export type GifSearchResponse = z.infer<typeof GifSearchResponse>;

// ---------- presence & invites (slice 3) ----------

export const PresenceStatus = z.enum(["online", "idle", "offline"]);
export type PresenceStatus = z.infer<typeof PresenceStatus>;

/** Presence snapshots only ever contain connected users — absence = offline. */
export const PresenceSnapshot = z.record(Id, PresenceStatus.exclude(["offline"]));
export type PresenceSnapshot = z.infer<typeof PresenceSnapshot>;

export const InviteDTO = z.object({
  code: z.string(),
  // null = legacy account invite, joins the oldest server on register
  serverId: Id.nullable(),
  maxUses: z.number().int(),
  uses: z.number().int(),
  expiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type InviteDTO = z.infer<typeof InviteDTO>;

export const CreateInviteBody = z.object({
  maxUses: z.number().int().min(1).max(100).default(10),
  // null = never expires; default one week
  expiresInHours: z.number().int().min(1).max(24 * 30).nullable().default(168),
});
export type CreateInviteBody = z.infer<typeof CreateInviteBody>;

export const InvitePreviewDTO = z.object({
  code: z.string(),
  server: ServerDTO,
  memberCount: z.number().int(),
});
export type InvitePreviewDTO = z.infer<typeof InvitePreviewDTO>;

// ---------- WebSocket events (server → client) ----------

export const WsEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("READY"),
    data: z.object({
      user: UserDTO,
      servers: z.array(ServerWithChannelsDTO),
      presences: PresenceSnapshot,
    }),
  }),
  z.object({ type: z.literal("MESSAGE_CREATE"), data: MessageDTO }),
  z.object({ type: z.literal("CHANNEL_CREATE"), data: ChannelDTO }),
  z.object({
    type: z.literal("CHANNEL_DELETE"),
    data: z.object({ id: Id, serverId: Id }),
  }),
  z.object({ type: z.literal("SERVER_CREATE"), data: ServerWithChannelsDTO }),
  z.object({ type: z.literal("USER_UPDATE"), data: z.object({ user: UserDTO }) }),
  z.object({
    type: z.literal("PRESENCE_UPDATE"),
    data: z.object({ userId: Id, status: PresenceStatus }),
  }),
  z.object({
    type: z.literal("TYPING_START"),
    data: z.object({ channelId: Id, user: UserDTO }),
  }),
  z.object({ type: z.literal("PONG"), data: z.object({}).strict() }),
]);
export type WsEvent = z.infer<typeof WsEvent>;

// ---------- WebSocket messages (client → server) ----------

export const WsClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PING") }),
  z.object({
    type: z.literal("TYPING_START"),
    data: z.object({ channelId: Id }),
  }),
]);
export type WsClientMessage = z.infer<typeof WsClientMessage>;
