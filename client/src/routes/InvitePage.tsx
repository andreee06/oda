import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { InvitePreviewDTO, ServerWithChannelsDTO } from "@oda/shared";
import { api, ApiRequestError } from "../lib/api";
import { useAppStore } from "../stores/app";

export const PENDING_INVITE_KEY = "oda_pending_invite";

/** /invite/:code — preview the server, join with one click. */
export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<InvitePreviewDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!code) return;
    api<InvitePreviewDTO>(`/api/invites/${code}`)
      .then(setPreview)
      .catch((err) => {
        if (err instanceof ApiRequestError && err.status === 401) {
          // Not logged in: stash the code, register will consume it.
          sessionStorage.setItem(PENDING_INVITE_KEY, code);
          navigate("/login");
          return;
        }
        setError("This invite is invalid, exhausted, or expired.");
      });
  }, [code, navigate]);

  async function join() {
    if (!code) return;
    setBusy(true);
    try {
      const server = await api<ServerWithChannelsDTO>(
        `/api/invites/${code}/accept`,
        { method: "POST", body: {} },
      );
      useAppStore.getState().addServer(server);
      navigate("/");
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.status === 409
          ? "You're already a member of this server."
          : "Couldn't join — the invite may be exhausted.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-8 text-center shadow-xl">
        {error ? (
          <>
            <h1 className="text-xl font-semibold">Invite doesn't work</h1>
            <p className="mt-2 text-sm text-zinc-400">{error}</p>
            <button
              onClick={() => navigate("/")}
              className="mt-4 w-full rounded-lg bg-zinc-700 py-2 text-sm hover:bg-zinc-600"
            >
              Back to Oda
            </button>
          </>
        ) : !preview ? (
          <p className="text-zinc-400">Checking invite…</p>
        ) : (
          <>
            <p className="text-sm text-zinc-400">You've been invited to</p>
            <h1 className="mt-1 text-2xl font-bold">{preview.server.name}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {preview.memberCount} member{preview.memberCount === 1 ? "" : "s"}
            </p>
            <button
              onClick={() => void join()}
              disabled={busy}
              className="mt-5 w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? "Joining…" : "Join server"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
