import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { MeResponse } from "@oda/shared";
import { api } from "../lib/api";
import { gateway } from "../gateway/client";
import { useAppStore } from "../stores/app";
import ServerRail from "../components/ServerRail";
import ChannelSidebar from "../components/ChannelSidebar";
import ChatView from "../components/ChatView";
import MemberList from "../components/MemberList";

export default function AppShell() {
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api<MeResponse>("/api/auth/me")
      .then((me) => {
        if (cancelled) return;
        useAppStore.getState().setSession(me.user, me.servers);
        gateway.connect();
      })
      .catch(() => {
        if (!cancelled) navigate("/login");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      gateway.close();
    };
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading Oda…
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <ServerRail />
      <ChannelSidebar />
      <main className="flex min-w-0 flex-1 flex-col bg-zinc-950">
        <ChatView />
      </main>
      <MemberList />
    </div>
  );
}
