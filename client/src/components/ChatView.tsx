import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { gateway } from "../gateway/client";
import { apiUpload } from "../lib/api";
import { isImageOnlyMessage, renderContent } from "../lib/content";
import { useAppStore } from "../stores/app";
import Avatar from "./Avatar";
import EmojiPicker from "./EmojiPicker";
import GifPicker from "./GifPicker";

// stable reference — a fresh [] in a zustand selector = infinite render loop
const NO_EMOJIS: never[] | import("@oda/shared").EmojiDTO[] = [];

export default function ChatView() {
  const server = useAppStore((s) =>
    s.servers.find((x) => x.id === s.activeServerId),
  );
  const channel = useAppStore((s) => {
    const srv = s.servers.find((x) => x.id === s.activeServerId);
    return srv?.channels.find((c) => c.id === s.activeChannelId) ?? null;
  });
  const messages = useAppStore((s) =>
    s.activeChannelId ? s.messages[s.activeChannelId] : undefined,
  );
  const nextCursor = useAppStore((s) =>
    s.activeChannelId ? s.nextCursors[s.activeChannelId] : null,
  );
  const connectionStatus = useAppStore((s) => s.connectionStatus);
  const sendError = useAppStore((s) => s.sendError);
  const emojis = useAppStore((s) =>
    s.activeServerId ? (s.emojis[s.activeServerId] ?? NO_EMOJIS) : NO_EMOJIS,
  );
  const user = useAppStore((s) => s.user);
  const typingUsers = useAppStore((s) =>
    s.activeChannelId ? s.typing[s.activeChannelId] : undefined,
  );
  const loadOlder = useAppStore((s) => s.loadOlder);
  const sendMessage = useAppStore((s) => s.sendMessage);

  const [draft, setDraft] = useState("");
  const [pendingUploads, setPendingUploads] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [picker, setPicker] = useState<"none" | "gif" | "emoji">("none");
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const emojiMap = useMemo(
    () => new Map(emojis.map((e) => [e.name, e.imageUrl])),
    [emojis],
  );

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

  const isOwner = server && user && server.ownerId === user.id;

  // "alice is typing…" — your own typing is never shown to you
  const typingNames = Object.entries(typingUsers ?? {})
    .filter(([id]) => id !== user?.id)
    .map(([, name]) => name);
  const typingText =
    typingNames.length === 0
      ? null
      : typingNames.length === 1
        ? `${typingNames[0]} is typing…`
        : typingNames.length === 2
          ? `${typingNames[0]} and ${typingNames[1]} are typing…`
          : `${typingNames.length} people are typing…`;

  async function onSend(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content && pendingUploads.length === 0) return;
    if (!content) return; // v2: attachments always ride with text
    setDraft("");
    setPendingUploads([]);
    setPicker("none");
    await sendMessage(content, pendingUploads);
  }

  async function onAttach(file: File) {
    setUploading(true);
    try {
      const { url } = await apiUpload("/api/uploads", file);
      setPendingUploads((prev) => [...prev, url]);
    } catch {
      window.alert("Upload failed (images only, max 8MB)");
    } finally {
      setUploading(false);
    }
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
            <div className="mt-0.5">
              <Avatar user={m.author} />
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
              {isImageOnlyMessage(m.content) ? (
                <img
                  src={m.content.trim()}
                  alt="embedded image"
                  loading="lazy"
                  className="mt-1 max-h-72 rounded-lg"
                />
              ) : (
                <p className="whitespace-pre-wrap break-words text-zinc-200">
                  {renderContent(m.content, emojiMap)}
                </p>
              )}
              {m.attachments.map((a) => (
                <img
                  key={a.url}
                  src={a.url}
                  alt="attachment"
                  loading="lazy"
                  className="mt-1 max-h-72 rounded-lg"
                />
              ))}
              {m.embeds.map((e) => (
                <div
                  key={e.url}
                  className="mt-1 max-w-md rounded border-l-4 border-indigo-500 bg-zinc-900 p-3"
                >
                  {e.title && (
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-indigo-400 hover:underline"
                    >
                      {e.title}
                    </a>
                  )}
                  {e.description && (
                    <p className="mt-0.5 text-sm text-zinc-400">
                      {e.description}
                    </p>
                  )}
                  {e.imageUrl && (
                    <img
                      src={e.imageUrl}
                      alt=""
                      loading="lazy"
                      className="mt-2 max-h-48 rounded"
                    />
                  )}
                </div>
              ))}
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

      {pendingUploads.length > 0 && (
        <div className="flex gap-2 px-3 pt-2">
          {pendingUploads.map((url) => (
            <button
              key={url}
              onClick={() =>
                setPendingUploads((prev) => prev.filter((u) => u !== url))
              }
              title="Remove attachment"
              className="group relative"
            >
              <img src={url} alt="pending upload" className="h-16 rounded-lg" />
              <span className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs group-hover:flex">
                ×
              </span>
            </button>
          ))}
        </div>
      )}

      {/* fixed height so the layout doesn't jump when someone types */}
      <div className="h-5 px-4 text-xs text-zinc-500">{typingText}</div>

      <div className="relative p-3">
        {picker === "gif" && (
          <div className="absolute bottom-full right-3">
            <GifPicker
              onSelect={(url) => {
                void sendMessage(url);
                setPicker("none");
              }}
            />
          </div>
        )}
        {picker === "emoji" && server && (
          <div className="absolute bottom-full right-3">
            <EmojiPicker
              serverId={server.id}
              isOwner={!!isOwner}
              onSelect={(shortcode) => setDraft((d) => d + shortcode)}
            />
          </div>
        )}

        <form
          onSubmit={(e) => void onSend(e)}
          className="flex items-center gap-2 rounded-lg bg-zinc-800 px-2"
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onAttach(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="Attach image"
            className="px-1 text-lg text-zinc-400 hover:text-zinc-100 disabled:opacity-40"
          >
            {uploading ? "…" : "+"}
          </button>
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              gateway.sendTyping(channel.id);
            }}
            placeholder={`Message #${channel.name}`}
            className="flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-zinc-500"
          />
          <button
            type="button"
            onClick={() => setPicker(picker === "gif" ? "none" : "gif")}
            className={`rounded px-1.5 py-0.5 text-xs font-bold ${
              picker === "gif"
                ? "bg-indigo-600 text-white"
                : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            GIF
          </button>
          <button
            type="button"
            onClick={() => setPicker(picker === "emoji" ? "none" : "emoji")}
            title="Emoji"
            className={`px-1 text-lg ${
              picker === "emoji" ? "opacity-100" : "opacity-60 hover:opacity-100"
            }`}
          >
            😀
          </button>
        </form>
      </div>
    </div>
  );
}
