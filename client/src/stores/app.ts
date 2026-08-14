import { create } from "zustand";
import type {
  ChannelDTO,
  MessageDTO,
  MessagePage,
  ServerWithChannelsDTO,
  UserDTO,
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
  setConnectionStatus: (status: ConnectionStatus) => void;
  sendMessage: (content: string) => Promise<void>;
}

const initialState = {
  user: null,
  servers: [],
  members: [],
  activeServerId: null,
  activeChannelId: null,
  messages: {},
  nextCursors: {},
  connectionStatus: "connecting" as ConnectionStatus,
  sendError: null,
};

export const useAppStore = create<AppState>()((set, get) => ({
  ...initialState,

  reset: () => set(initialState),

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
    const { members } = await api<{ members: UserDTO[] }>(
      `/api/servers/${serverId}/members`,
    );
    set({ members });
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

  sendMessage: async (content) => {
    const { activeChannelId, user } = get();
    if (!activeChannelId || !user) return;
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: MessageDTO = {
      id: tempId,
      channelId: activeChannelId,
      author: user,
      content,
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
        { method: "POST", body: { content } },
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

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
}));
