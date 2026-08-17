import { useRef, useState } from "react";
import type { UserDTO } from "@oda/shared";
import { api, apiUpload } from "../lib/api";
import { useAppStore } from "../stores/app";
import Avatar from "./Avatar";

/** Bottom-of-sidebar user chip: avatar (click to change) + display name. */
export default function UserPanel() {
  const user = useAppStore((s) => s.user);
  const updateUser = useAppStore((s) => s.updateUser);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  async function changeAvatar(file: File) {
    setBusy(true);
    try {
      const { url } = await apiUpload("/api/uploads", file);
      const res = await api<{ user: UserDTO }>("/api/users/me/avatar", {
        method: "PATCH",
        body: { avatarUrl: url },
      });
      updateUser(res.user);
    } catch {
      window.alert("Avatar upload failed (images only, max 8MB)");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-900/80 p-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void changeAvatar(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        title="Change avatar"
        disabled={busy}
        className="rounded-full transition-opacity hover:opacity-75 disabled:opacity-40"
      >
        <Avatar user={user} size="h-8 w-8 text-xs" />
      </button>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{user.displayName}</p>
        <p className="truncate text-xs text-zinc-500">@{user.username}</p>
      </div>
    </div>
  );
}
