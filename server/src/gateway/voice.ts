import type { UserDTO, VoiceParticipantDTO, VoiceStatesSnapshot } from "@oda/shared";

interface VoiceChannel {
  serverId: string;
  participants: Map<string, VoiceParticipantDTO>;
}

/**
 * In-memory voice roster. Like presence (SPEC v1): no Redis, one process.
 * LiveKit owns the actual audio; this registry owns WHO we show in the UI.
 */
export class VoiceRegistry {
  private readonly channels = new Map<string, VoiceChannel>();

  /** Idempotent: rejoining just refreshes the entry (and gets a fresh token). */
  join(channelId: string, serverId: string, user: UserDTO): VoiceParticipantDTO[] {
    let ch = this.channels.get(channelId);
    if (!ch) {
      ch = { serverId, participants: new Map() };
      this.channels.set(channelId, ch);
    }
    ch.participants.set(user.id, { user, muted: false, deafened: false });
    return this.roster(channelId);
  }

  /** Returns the new roster, or null if the user wasn't in the channel. */
  leave(channelId: string, userId: string): VoiceParticipantDTO[] | null {
    const ch = this.channels.get(channelId);
    if (!ch || !ch.participants.delete(userId)) return null;
    if (ch.participants.size === 0) this.channels.delete(channelId);
    return this.roster(channelId);
  }

  /** deafen implies muted (Discord semantics). Null if user not in channel. */
  setState(
    channelId: string,
    userId: string,
    state: { muted: boolean; deafened: boolean },
  ): VoiceParticipantDTO[] | null {
    const participant = this.channels.get(channelId)?.participants.get(userId);
    if (!participant) return null;
    participant.muted = state.muted || state.deafened;
    participant.deafened = state.deafened;
    return this.roster(channelId);
  }

  /** Drop a user from every voice channel (gateway disconnect cleanup). */
  removeUserEverywhere(
    userId: string,
  ): { channelId: string; serverId: string; roster: VoiceParticipantDTO[] }[] {
    const affected = [];
    for (const [channelId, ch] of this.channels) {
      if (ch.participants.delete(userId)) {
        if (ch.participants.size === 0) this.channels.delete(channelId);
        affected.push({ channelId, serverId: ch.serverId, roster: this.roster(channelId) });
      }
    }
    return affected;
  }

  /** channelId → roster, optionally filtered to the given servers. */
  snapshot(serverIds?: ReadonlySet<string>): VoiceStatesSnapshot {
    const out: VoiceStatesSnapshot = {};
    for (const [channelId, ch] of this.channels) {
      if (serverIds && !serverIds.has(ch.serverId)) continue;
      if (ch.participants.size > 0) out[channelId] = this.roster(channelId);
    }
    return out;
  }

  private roster(channelId: string): VoiceParticipantDTO[] {
    return [...(this.channels.get(channelId)?.participants.values() ?? [])];
  }
}
