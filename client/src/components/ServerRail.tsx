import { useNavigate } from "react-router";
import type { ServerWithChannelsDTO } from "@oda/shared";
import { api } from "../lib/api";
import { gateway } from "../gateway/client";
import { useAppStore } from "../stores/app";

export default function ServerRail() {
  const servers = useAppStore((s) => s.servers);
  const activeServerId = useAppStore((s) => s.activeServerId);
  const setActiveServer = useAppStore((s) => s.setActiveServer);
  const addServer = useAppStore((s) => s.addServer);
  const navigate = useNavigate();

  async function createServer() {
    const name = window.prompt("Server name?");
    if (!name?.trim()) return;
    const server = await api<ServerWithChannelsDTO>("/api/servers", {
      method: "POST",
      body: { name: name.trim() },
    });
    addServer(server);
    await setActiveServer(server.id);
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    gateway.close();
    useAppStore.getState().reset();
    navigate("/login");
  }

  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-2 border-r border-zinc-800 bg-zinc-950 py-3">
      {servers.map((s) => (
        <button
          key={s.id}
          onClick={() => void setActiveServer(s.id)}
          title={s.name}
          className={`flex h-12 w-12 items-center justify-center text-lg font-semibold transition-all hover:rounded-2xl hover:bg-indigo-500 ${
            s.id === activeServerId
              ? "rounded-2xl bg-indigo-500 text-white"
              : "rounded-3xl bg-zinc-800 text-zinc-300"
          }`}
        >
          {s.name.slice(0, 1).toUpperCase()}
        </button>
      ))}
      <button
        onClick={() => void createServer()}
        title="Create server"
        className="flex h-12 w-12 items-center justify-center rounded-3xl bg-zinc-800 text-2xl text-green-500 transition-all hover:rounded-2xl hover:bg-green-500 hover:text-white"
      >
        +
      </button>
      <button
        onClick={() => void logout()}
        title="Log out"
        className="mt-auto flex h-12 w-12 items-center justify-center rounded-3xl bg-zinc-800 text-zinc-400 transition-all hover:rounded-2xl hover:bg-red-500 hover:text-white"
      >
        ⏻
      </button>
    </nav>
  );
}
