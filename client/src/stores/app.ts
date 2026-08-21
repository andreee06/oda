import { create } from "zustand";
import type {
  ChannelDTO,
  EmojiDTO,
  MessageDTO,
  MessagePage,
  PresenceSnapshot,
  PresenceStatus,
  ServerWithChannelsDTO,
  UserDTO,
  VoiceParticipantDTO,
  VoiceStatesSnapshot,
} from "@oda/shared";
import { api } from "../lib/api";

export type ConnectionStatus = "connecting" | "online" | "disconnected";

interface AppState {
  user: UserDTO | null;
  servers: ServerWithChannelsDTO[];
  members: UserDTO[];
  activeServerId: string | null;
  activeChannelId: string | null;
  /** channelId → messages ascending by createdAt (server returns desc). */
  messages: Record<string, MessageDTO[]>;
  /** serverId → custom emoji */
  emojis: Record<string, EmojiDTO[]>;
  /** userId → status; absence in snapshot/events = offline */
  presence: Record<string, PresenceStatus>;
  /** channelId → userId → displayName. Entries self-expire after 3s. */
  typing: Record<string, Record<string, string>>;
  /** channelId → voice roster (full snapshots from VOICE_STATE) */
  voiceStates: Record<string, VoiceParticipantDTO[]>;
  /** the voice channel I'm connected to, if any */
  myVoiceChannelId: string | null;
  /** userIds currently speaking (LiveKit ActiveSpeakersChanged) */
  speaking: string[];
  nextCursors: Record<string, string | null>;
  connectionStatus: ConnectionStatus;
  sendError: string | null;

  reset: () => void;
  setSession: (user: UserDTO, servers: ServerWithChannelsDTO[]) => void;
  setActiveServer: (serverId: string) => Promise<void>;
  setActiveChannel: (channelId: string) => Promise<void>;
  loadChannelMessages: (channelId: string) => Promise<void>;
  loadOlder: () => Promise<void>;
  addMessage: (message: MessageDTO) => void;
  addChannel: (channel: ChannelDTO) => void;
  removeChannel: (channelId: string) => void;
  addServer: (server: ServerWithChannelsDTO) => void;
  updateUser: (user: UserDTO) => void;
  addEmoji: (emoji: EmojiDTO) => void;
  setPresences: (snapshot: PresenceSnapshot) => void;
  setPresence: (userId: string, status: PresenceStatus) => void;
  addTyping: (channelId: string, user: UserDTO) => void;
  clearTyping: (channelId: string, userId: string) => void;
  setVoiceState: (channelId: string, participants: VoiceParticipantDTO[]) => void;
  setVoiceStates: (snapshot: VoiceStatesSnapshot) => void;
  setMyVoiceChannel: (channelId: string | null) => void;
  setSpeaking: (userIds: string[]) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  sendMessage: (content: string, attachmentUrls?: string[]) => Promise<void>;
}

const initialState = {
  user: null,
  servers: [],
  members: [],
  activeServerId: null,
  activeChannelId: null,
  messages: {},
  emojis: {},
  presence: {},
  typing: {},
  voiceStates: {},
  myVoiceChannelId: null,
  speaking: [],
  nextCursors: {},
  connectionStatus: "connecting" as ConnectionStatus,
  sendError: null,
};

/** 3s of silence = stopped typing (SPEC). Timers live outside zustand state. */
const TYPING_TTL_MS = 3_000;
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useAppStore = create<AppState>()((set, get) => ({
  ...initialState,

  reset: () => {
    for (const timer of typingTimers.values()) clearTimeout(timer);
    typingTimers.clear();
    set(initialState);
  },

  setSession: (user, servers) => {
    set({ user, servers });
    const first = servers[0];
    if (first && !get().activeServerId) {
      void get().setActiveServer(first.id);
    }
  },

  setActiveServer: async (serverId) => {
    const server = get().servers.find((s) => s.id === serverId);
    if (!server) return;
    const channelId =
      server.channels.find((c) => c.type === "text")?.id ??
      server.channels[0]?.id ??
      null;
    set({ activeServerId: serverId, activeChannelId: channelId });
    const [{ members }, { emojis }] = await Promise.all([
      api<{ members: UserDTO[] }>(`/api/servers/${serverId}/members`),
      api<{ emojis: EmojiDTO[] }>(`/api/servers/${serverId}/emojis`),
    ]);
    set((state) => ({
      members,
      emojis: { ...state.emojis, [serverId]: emojis },
    }));
    if (channelId && !get().messages[channelId]) {
      await get().loadChannelMessages(channelId);
    }
  },

  setActiveChannel: async (channelId) => {
    set({ activeChannelId: channelId });
    if (!get().messages[channelId]) {
      await get().loadChannelMessages(channelId);
    }
  },

  loadChannelMessages: async (channelId) => {
    const page = await api<MessagePage>(`/api/channels/${channelId}/messages`);
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: [...page.messages].reverse(),
      },
      nextCursors: { ...state.nextCursors, [channelId]: page.nextCursor },
    }));
  },

  loadOlder: async () => {
    const channelId = get().activeChannelId;
    if (!channelId) return;
    const cursor = get().nextCursors[channelId];
    if (!cursor) return;
    const page = await api<MessagePage>(
      `/api/channels/${channelId}/messages?before=${encodeURIComponent(cursor)}`,
    );
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: [
          ...[...page.messages].reverse(),
          ...(state.messages[channelId] ?? []),
        ],
      },
      nextCursors: { ...state.nextCursors, [channelId]: page.nextCursor },
    }));
  },

  addMessage: (message) => {
    // They sent the message — they can't still be typing it.
    get().clearTyping(message.channelId, message.author.id);
    set((state) => {
      const list = state.messages[message.channelId];
      // Unknown channel (never opened) → skip; messages load on open.
      if (!list || list.some((m) => m.id === message.id)) return {};
      return {
        messages: {
          ...state.messages,
          [message.channelId]: [...list, message],
        },
      };
    });
  },

  sendMessage: async (content, attachmentUrls) => {
    const { activeChannelId, user } = get();
    if (!activeChannelId || !user) return;
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: MessageDTO = {
      id: tempId,
      channelId: activeChannelId,
      author: user,
      content,
      attachments: (attachmentUrls ?? []).map((url) => ({ url })),
      embeds: [],
      editedAt: null,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      messages: {
        ...state.messages,
        [activeChannelId]: [
          ...(state.messages[activeChannelId] ?? []),
          optimistic,
        ],
      },
      sendError: null,
    }));
    try {
      const real = await api<MessageDTO>(
        `/api/channels/${activeChannelId}/messages`,
        {
          method: "POST",
          body: attachmentUrls?.length
            ? { content, attachmentUrls }
            : { content },
        },
      );
      set((state) => {
        const list = state.messages[activeChannelId] ?? [];
        // The WS echo may have beaten the REST response — don't duplicate.
        const delivered = list.some((m) => m.id === real.id);
        return {
          messages: {
            ...state.messages,
            [activeChannelId]: delivered
              ? list.filter((m) => m.id !== tempId)
              : list.map((m) => (m.id === tempId ? real : m)),
          },
        };
      });
    } catch (err) {
      // Rollback: drop the optimistic message, surface the error.
      set((state) => ({
        messages: {
          ...state.messages,
          [activeChannelId]: (state.messages[activeChannelId] ?? []).filter(
            (m) => m.id !== tempId,
          ),
        },
        sendError: err instanceof Error ? err.message : "send failed",
      }));
    }
  },

  addChannel: (channel) =>
    set((state) => ({
      servers: state.servers.map((s) =>
        s.id === channel.serverId &&
        !s.channels.some((c) => c.id === channel.id)
          ? { ...s, channels: [...s.channels, channel] }
          : s,
      ),
    })),

  removeChannel: (channelId) =>
    set((state) => ({
      servers: state.servers.map((s) => ({
        ...s,
        channels: s.channels.filter((c) => c.id !== channelId),
      })),
    })),

  addServer: (server) =>
    set((state) =>
      state.servers.some((s) => s.id === server.id)
        ? {}
        : { servers: [...state.servers, server] },
    ),

  updateUser: (updated) =>
    set((state) => ({
      user: state.user?.id === updated.id ? updated : state.user,
      members: state.members.map((m) => (m.id === updated.id ? updated : m)),
    })),

  addEmoji: (emoji) =>
    set((state) => ({
      emojis: {
        ...state.emojis,
        [emoji.serverId]: [...(state.emojis[emoji.serverId] ?? []), emoji],
      },
    })),

  setPresences: (snapshot) => set({ presence: { ...snapshot } }),
  setPresence: (userId, status) =>
    set((state) => ({ presence: { ...state.presence, [userId]: status } })),

  addTyping: (channelId, user) => {
    const key = `${channelId}|${user.id}`;
    const existing = typingTimers.get(key);
    if (existing) clearTimeout(existing); // still typing → restart the clock
    typingTimers.set(
      key,
      setTimeout(() => get().clearTyping(channelId, user.id), TYPING_TTL_MS),
    );
    set((state) => ({
      typing: {
        ...state.typing,
        [channelId]: { ...(state.typing[channelId] ?? {}), [user.id]: user.displayName },
      },
    }));
  },

  clearTyping: (channelId, userId) => {
    const key = `${channelId}|${userId}`;
    const timer = typingTimers.get(key);
    if (timer) clearTimeout(timer);
    typingTimers.delete(key);
    set((state) => {
      const channelTyping = state.typing[channelId];
      if (!channelTyping || !(userId in channelTyping)) return {};
      const rest = { ...channelTyping };
      delete rest[userId];
      const typing = { ...state.typing };
      if (Object.keys(rest).length === 0) delete typing[channelId];
      else typing[channelId] = rest;
      return { typing };
    });
  },

  setVoiceState: (channelId, participants) =>
    set((state) => ({
      voiceStates: { ...state.voiceStates, [channelId]: participants },
    })),

  setVoiceStates: (snapshot) => set({ voiceStates: { ...snapshot } }),

  setMyVoiceChannel: (myVoiceChannelId) => set({ myVoiceChannelId }),

  setSpeaking: (speaking) => set({ speaking }),

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
}));
