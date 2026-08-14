import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAppStore } from "../stores/app";

export default function ChatView() {
  const channel = useAppStore((s) => {
    const server = s.servers.find((x) => x.id === s.activeServerId);
    return server?.channels.find((c) => c.id === s.activeChannelId) ?? null;
  });
  const messages = useAppStore((s) =>
    s.activeChannelId ? s.messages[s.activeChannelId] : undefined,
  );
  const nextCursor = useAppStore((s) =>
    s.activeChannelId ? s.nextCursors[s.activeChannelId] : null,
  );
  const connectionStatus = useAppStore((s) => s.connectionStatus);
  const sendError = useAppStore((s) => s.sendError);
  const loadOlder = useAppStore((s) => s.loadOlder);
  const sendMessage = useAppStore((s) => s.sendMessage);

  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length, channel?.id]);

  if (!channel) {
    return (
      <div className="flex flex-1 items-center justify-center text-zinc-500">
        Select a channel
      </div>
    );
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setDraft("");
    await sendMessage(content);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <span className="text-xl text-zinc-500">#</span>
        <span className="font-semibold">{channel.name}</span>
        <span
          className={`ml-auto text-xs ${
            connectionStatus === "online" ? "text-green-500" : "text-yellow-500"
          }`}
        >
          {connectionStatus}
        </span>
      </header>

      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {nextCursor && (
          <button
            onClick={() => void loadOlder()}
            className="text-xs text-indigo-400 hover:underline"
          >
            Load older messages
          </button>
        )}
        {(messages ?? []).map((m) => (
          <div key={m.id} className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold">
              {m.author.displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-medium">{m.author.displayName}</span>
                <span className="text-xs text-zinc-500">
                  {new Date(m.createdAt).toLocaleTimeString()}
                </span>
                {m.editedAt && (
                  <span className="text-xs text-zinc-600">(edited)</span>
                )}
                {m.id.startsWith("temp-") && (
                  <span className="text-xs text-zinc-600">sending…</span>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words text-zinc-200">
                {m.content}
              </p>
            </div>
          </div>
        ))}
        {messages && messages.length === 0 && (
          <p className="text-sm text-zinc-500">No messages yet — say hi 👋</p>
        )}
      </div>

      {sendError && (
        <p className="px-4 pb-1 text-xs text-red-400">
          Send failed: {sendError}
        </p>
      )}
      <form onSubmit={(e) => void onSend(e)} className="p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message #${channel.name}`}
          className="w-full rounded-lg bg-zinc-800 px-3 py-2.5 text-sm outline-none placeholder:text-zinc-500 focus:ring-1 focus:ring-indigo-500"
        />
      </form>
    </div>
  );
}
