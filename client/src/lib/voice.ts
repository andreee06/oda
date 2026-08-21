import type { Room } from "livekit-client"; // type-only: erased at build
import type { VoiceJoinResponse } from "@oda/shared";
import { api } from "./api";
import { useAppStore } from "../stores/app";

/**
 * Singleton wrapper around the LiveKit Room. NOT in zustand — Room isn't
 * serializable. livekit-client is ~550KB, so it's dynamically imported on
 * first voice join instead of weighing down the main bundle.
 */
let room: Room | null = null;

function myParticipant() {
  const { myVoiceChannelId, voiceStates, user } = useAppStore.getState();
  if (!myVoiceChannelId || !user) return null;
  return (
    voiceStates[myVoiceChannelId]?.find((p) => p.user.id === user.id) ?? null
  );
}

export async function joinVoice(channelId: string): Promise<void> {
  if (room) await leaveVoice(); // one voice channel at a time, Discord-style
  const { token, url } = await api<VoiceJoinResponse>(
    `/api/channels/${channelId}/voice/join`,
    { method: "POST", body: {} },
  );
  const { Room, RoomEvent } = await import("livekit-client");
  const next = new Room();
  next.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
    useAppStore.getState().setSpeaking(speakers.map((s) => s.identity));
  });
  next.on(RoomEvent.Disconnected, () => {
    // server kicked us / network died — reflect it locally
    room = null;
    useAppStore.getState().setMyVoiceChannel(null);
    useAppStore.getState().setSpeaking([]);
  });
  await next.connect(url, token);
  await next.localParticipant.setMicrophoneEnabled(true);
  room = next;
  useAppStore.getState().setMyVoiceChannel(channelId);
}

export async function leaveVoice(): Promise<void> {
  const channelId = useAppStore.getState().myVoiceChannelId;
  room?.disconnect();
  room = null;
  useAppStore.getState().setMyVoiceChannel(null);
  useAppStore.getState().setSpeaking([]);
  if (channelId) {
    await api(`/api/channels/${channelId}/voice/leave`, {
      method: "POST",
      body: {},
    });
  }
}

export async function toggleMute(): Promise<void> {
  const me = myParticipant();
  const channelId = useAppStore.getState().myVoiceChannelId;
  if (!room || !me || !channelId) return;
  if (me.deafened) return; // can't unmute while deafened (Discord semantics)
  const muted = !me.muted;
  await room.localParticipant.setMicrophoneEnabled(!muted);
  await api(`/api/channels/${channelId}/voice/state`, {
    method: "POST",
    body: { muted, deafened: false },
  });
}

export async function toggleDeafen(): Promise<void> {
  const me = myParticipant();
  const channelId = useAppStore.getState().myVoiceChannelId;
  if (!room || !me || !channelId) return;
  const deafened = !me.deafened;
  // deafened ⇒ no mic; undeafening restores the previous mute choice
  await room.localParticipant.setMicrophoneEnabled(!(deafened || me.muted));
  await api(`/api/channels/${channelId}/voice/state`, {
    method: "POST",
    body: { muted: me.muted, deafened },
  });
}
