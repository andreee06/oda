import { useState } from "react";
import type { ChannelDTO } from "@oda/shared";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app";
import InviteModal from "./InviteModal";
import UserPanel from "./UserPanel";

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
          <button
            key={c.id}
            onClick={() => void setActiveChannel(c.id)}
            className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm ${
              c.id === activeChannelId
                ? "bg-zinc-700/60 text-zinc-100"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            <span className="text-zinc-500">{c.type === "voice" ? "🔊" : "#"}</span>
            <span className="truncate">{c.name}</span>
          </button>
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
      <UserPanel />
      {showInvites && server && (
        <InviteModal serverId={server.id} onClose={() => setShowInvites(false)} />
      )}
    </aside>
  );
}
