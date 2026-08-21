import { useAppStore } from "../stores/app";
import { leaveVoice, toggleDeafen, toggleMute } from "../lib/voice";

/** Discord-style voice control bar, sits above the user panel when connected. */
export default function VoicePanel() {
  const myVoiceChannelId = useAppStore((s) => s.myVoiceChannelId);
  const channel = useAppStore((s) => {
    for (const srv of s.servers) {
      const c = srv.channels.find((x) => x.id === s.myVoiceChannelId);
      if (c) return c;
    }
    return null;
  });
  const me = useAppStore((s) =>
    s.myVoiceChannelId
      ? s.voiceStates[s.myVoiceChannelId]?.find((p) => p.user.id === s.user?.id)
      : undefined,
  );

  if (!myVoiceChannelId || !channel) return null;

  const btn = "rounded p-1.5 text-sm hover:bg-zinc-700";
  return (
    <div className="border-t border-zinc-800 bg-zinc-900 px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-xs font-semibold text-emerald-400">Voice connected</span>
        <span className="truncate text-xs text-zinc-500">/ {channel.name}</span>
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => void toggleMute()}
          title={me?.muted ? "Unmute" : "Mute"}
          className={btn}
        >
          {me?.muted ? "🔇" : "🎤"}
        </button>
        <button
          onClick={() => void toggleDeafen()}
          title={me?.deafened ? "Undeafen" : "Deafen"}
          className={`${btn} ${me?.deafened ? "bg-zinc-700" : ""}`}
        >
          🎧
        </button>
        <button
          onClick={() => void leaveVoice()}
          title="Disconnect"
          className={`${btn} ml-auto text-red-400`}
        >
          📞✕
        </button>
      </div>
    </div>
  );
}
