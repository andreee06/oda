import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { UserDTO } from "@oda/shared";
import { api, ApiRequestError } from "../lib/api";
import { PENDING_INVITE_KEY } from "./InvitePage";

export default function LoginPage() {
  // Landing here from an /invite/:code link stashes the code — register with it.
  const pendingInvite = sessionStorage.getItem(PENDING_INVITE_KEY) ?? "";
  const [mode, setMode] = useState<"login" | "register">(
    pendingInvite ? "register" : "login",
  );
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(pendingInvite);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body =
        mode === "login"
          ? { username, password }
          : {
              username,
              displayName: displayName || username,
              password,
              inviteCode,
            };
      await api<{ user: UserDTO }>(`/api/auth/${mode}`, {
        method: "POST",
        body,
      });
      sessionStorage.removeItem(PENDING_INVITE_KEY);
      navigate("/");
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "something went wrong",
      );
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none placeholder:text-zinc-500 focus:ring-1 focus:ring-indigo-500";

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-8 shadow-xl">
        <h1 className="text-center text-3xl font-bold">Oda</h1>
        <p className="mt-1 text-center text-sm text-zinc-400">
          {mode === "login" ? "Welcome back" : "Join with an invite code"}
        </p>

        <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-3">
          <input
            className={inputClass}
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
          {mode === "register" && (
            <>
              <input
                className={inputClass}
                placeholder="Display name (optional)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <input
                className={inputClass}
                placeholder="Invite code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                required
              />
            </>
          )}
          <input
            className={inputClass}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            required
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? "…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
          className="mt-4 w-full text-center text-sm text-indigo-400 hover:underline"
        >
          {mode === "login"
            ? "Need an account? Register with invite"
            : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}
