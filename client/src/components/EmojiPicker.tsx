import { useRef, useState } from "react";
import type { EmojiDTO } from "@oda/shared";
import { api, apiUpload } from "../lib/api";
import { useAppStore } from "../stores/app";

export default function EmojiPicker({
  serverId,
  isOwner,
  onSelect,
}: {
  serverId: string;
  isOwner: boolean;
  onSelect: (shortcode: string) => void;
}) {
  const emojis = useAppStore((s) => s.emojis[serverId] ?? []);
  const addEmoji = useAppStore((s) => s.addEmoji);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function uploadEmoji(file: File) {
    const name = window.prompt(
      "Shortcode name? (lowercase, digits, _ — e.g. pepelaugh)",
    );
    if (!name?.trim()) return;
    setError(null);
    try {
      const { url } = await apiUpload("/api/uploads", file);
      const emoji = await api<EmojiDTO>(`/api/servers/${serverId}/emojis`, {
        method: "POST",
        body: { name: name.trim(), imageUrl: url },
      });
      addEmoji(emoji);
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed");
    }
  }

  return (
    <div className="mb-2 w-72 max-w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl">
      {emojis.length === 0 && (
        <p className="px-1 text-xs text-zinc-500">
          No custom emoji yet{isOwner ? " — upload one below" : ""}
        </p>
      )}
      <div className="grid max-h-48 grid-cols-6 gap-1 overflow-y-auto">
        {emojis.map((e) => (
          <button
            key={e.id}
            onClick={() => onSelect(`:${e.name}:`)}
            title={`:${e.name}:`}
            className="rounded p-1 hover:bg-zinc-800"
          >
            <img src={e.imageUrl} alt={e.name} className="h-8 w-8" />
          </button>
        ))}
      </div>
      {error && <p className="px-1 pt-1 text-xs text-red-400">{error}</p>}
      {isOwner && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadEmoji(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-1 w-full rounded px-1 py-1 text-left text-xs text-indigo-400 hover:bg-zinc-800"
          >
            + upload emoji
          </button>
        </>
      )}
    </div>
  );
}
