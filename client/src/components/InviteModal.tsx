import { useEffect, useState } from "react";
import type { InviteDTO } from "@oda/shared";
import { api } from "../lib/api";

/** Owner-only modal: create invite links, copy them, revoke old ones. */
export default function InviteModal({
  serverId,
  onClose,
}: {
  serverId: string;
  onClose: () => void;
}) {
  const [invites, setInvites] = useState<InviteDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    api<{ invites: InviteDTO[] }>(`/api/servers/${serverId}/invites`)
      .then((res) => setInvites(res.invites))
      .catch(() => setError("couldn't load invites"));
  }, [serverId]);

  async function create() {
    const invite = await api<InviteDTO>(`/api/servers/${serverId}/invites`, {
      method: "POST",
      body: {},
    });
    setInvites((prev) => [invite, ...prev]);
  }

  async function revoke(code: string) {
    await api(`/api/servers/${serverId}/invites/${code}`, { method: "DELETE" });
    setInvites((prev) => prev.filter((i) => i.code !== code));
  }

  function link(code: string): string {
    return `${window.location.origin}/invite/${code}`;
  }

  async function copy(code: string) {
    await navigator.clipboard.writeText(link(code));
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-zinc-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Invite people</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Send a link — it works for new accounts and existing users.
        </p>

        <button
          onClick={() => void create()}
          className="mt-3 w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold hover:bg-indigo-500"
        >
          Create invite link
        </button>

        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {invites.map((inv) => (
            <li
              key={inv.code}
              className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-300">
                {link(inv.code)}
              </span>
              <span className="shrink-0 text-xs text-zinc-500">
                {inv.uses}/{inv.maxUses}
              </span>
              <button
                onClick={() => void copy(inv.code)}
                className="shrink-0 rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600"
              >
                {copied === inv.code ? "Copied!" : "Copy"}
              </button>
              <button
                onClick={() => void revoke(inv.code)}
                title="Revoke invite"
                className="shrink-0 px-1 text-zinc-500 hover:text-red-400"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
