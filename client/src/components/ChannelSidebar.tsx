import { useState } from "react";
import type { ChannelDTO } from "@oda/shared";
import { api } from "../lib/api";
import { joinVoice } from "../lib/voice";
import { useAppStore } from "../stores/app";
import Avatar from "./Avatar";
import InviteModal from "./InviteModal";
import UserPanel from "./UserPanel";
import VoicePanel from "./VoicePanel";

export default function ChannelSidebar() {
  const server = useAppStore((s) =>
    s.servers.find((x) => x.id === s.activeServerId),
  );
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const setActiveChannel = useAppStore((s) => s.setActiveChannel);
  const addChannel = useAppStore((s) => s.addChannel);
  const user = useAppStore((s) => s.user);

  const isOwner = server && user && server.ownerId === user.id;
  const [showInvites, setShowInvites] = useState(false);
  const voiceStates = useAppStore((s) => s.voiceStates);
  const speaking = useAppStore((s) => s.speaking);
  const myVoiceChannelId = useAppStore((s) => s.myVoiceChannelId);

  function onChannelClick(c: ChannelDTO) {
    if (c.type === "voice") {
      // clicking a voice channel joins it; clicking the one you're in is a no-op
      if (myVoiceChannelId !== c.id) void joinVoice(c.id);
      return;
    }
    void setActiveChannel(c.id);
  }

  async function createChannel() {
    if (!server) return;
    const name = window.prompt("Channel name? (lowercase, digits, hyphens)");
    if (!name?.trim()) return;
    const channel = await api<ChannelDTO>(`/api/servers/${server.id}/channels`, {
      method: "POST",
      body: { name: name.trim() },
    });
    addChannel(channel);
    await setActiveChannel(channel.id);
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
      <header className="flex items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
        <span className="truncate font-semibold">{server?.name ?? "Oda"}</span>
        {isOwner && (
          <button
            onClick={() => setShowInvites(true)}
            title="Invite people"
            className="shrink-0 rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            + invite
          </button>
        )}
      </header>
      <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {server?.channels.map((c) => (
          <div key={c.id}>
            <button
              onClick={() => onChannelClick(c)}
              className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm ${
                c.id === activeChannelId
                  ? "bg-zinc-700/60 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              <span className="text-zinc-500">{c.type === "voice" ? "🔊" : "#"}</span>
              <span className="truncate">{c.name}</span>
            </button>
            {(voiceStates[c.id] ?? []).map((p) => (
              <div key={p.user.id} className="ml-7 flex items-center gap-1.5 py-0.5">
                <div
                  data-testid={`voice-speaking-${p.user.id}`}
                  className={`rounded-full ${
                    speaking.includes(p.user.id) ? "ring-2 ring-green-500" : ""
                  }`}
                >
                  <Avatar user={p.user} size="h-5 w-5 text-[10px]" />
                </div>
                <span className="truncate text-xs text-zinc-400">
                  {p.user.displayName}
                </span>
                {p.muted && (
                  <span data-testid={`voice-muted-${p.user.id}`} className="text-xs">
                    🔇
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      {isOwner && (
        <button
          onClick={() => void createChannel()}
          className="mx-2 mt-1 rounded px-2 py-1 text-left text-xs text-zinc-500 hover:text-zinc-200"
        >
          + create channel
        </button>
      )}
      <VoicePanel />
      <UserPanel />
      {showInvites && server && (
        <InviteModal serverId={server.id} onClose={() => setShowInvites(false)} />
      )}
    </aside>
  );
}
