import type { PresenceSnapshot, PresenceStatus, WsEvent } from "@oda/shared";
import type { GatewayConnection } from "./connection.js";

/** Idle after 5 minutes without any non-PING activity (Discord uses 10; we're chattier). */
const IDLE_AFTER_MS = 5 * 60 * 1000;
/** At most one relayed TYPING_START per user+channel per this window. */
const TYPING_THROTTLE_MS = 2_000;

/** Registry of all live connections. In-process by design (SPEC v1, no Redis). */
export class Hub {
  private readonly connections = new Set<GatewayConnection>();
  /** Last presence status announced per user (absent = offline). */
  private readonly announced = new Map<string, "online" | "idle">();
  private readonly typingSentAt = new Map<string, number>();

  add(conn: GatewayConnection): void {
    this.connections.add(conn);
    this.refreshPresence(conn.userId, conn.serverIds);
  }

  remove(conn: GatewayConnection): void {
    this.connections.delete(conn);
    this.refreshPresence(conn.userId, conn.serverIds);
  }

  get size(): number {
    return this.connections.size;
  }

  /** Mark a user active (called on REST posts and non-PING gateway messages). */
  touch(userId: string): void {
    let serverIds: ReadonlySet<string> | null = null;
    for (const conn of this.connections) {
      if (conn.userId === userId) {
        conn.lastActivityAt = Date.now();
        serverIds ??= conn.serverIds;
      }
    }
    if (serverIds) this.refreshPresence(userId, serverIds);
  }

  /** userId → online|idle for every connected user. Absence means offline. */
  presenceSnapshot(): PresenceSnapshot {
    const snapshot: Record<string, "online" | "idle"> = {};
    for (const conn of this.connections) {
      // any non-idle connection wins over idle ones
      if (snapshot[conn.userId] === "online") continue;
      snapshot[conn.userId] = this.isIdle(conn) ? "idle" : "online";
    }
    return snapshot;
  }

  /** Typing throttle: returns true at most once per user+channel per 2s. */
  allowTyping(userId: string, channelId: string, now = Date.now()): boolean {
    const key = `${userId}|${channelId}`;
    const last = this.typingSentAt.get(key);
    if (last !== undefined && now - last < TYPING_THROTTLE_MS) return false;
    this.typingSentAt.set(key, now);
    if (this.typingSentAt.size > 1000) this.typingSentAt.clear(); // hygiene
    return true;
  }

  /** Serialize once, send to every connection subscribed to the channel. */
  dispatchToChannel(channelId: string, event: WsEvent, exceptUserId?: string): void {
    const payload = JSON.stringify(event);
    for (const conn of this.connections) {
      if (exceptUserId && conn.userId === exceptUserId) continue;
      if (conn.channelIds.has(channelId) && conn.socket.readyState === conn.socket.OPEN) {
        conn.socket.send(payload);
      }
    }
  }

  /** For events about server-level changes (new/deleted channels, etc.). */
  dispatchToServer(serverId: string, event: WsEvent, exceptUserId?: string): void {
    const payload = JSON.stringify(event);
    for (const conn of this.connections) {
      if (exceptUserId && conn.userId === exceptUserId) continue;
      if (conn.serverIds.has(serverId) && conn.socket.readyState === conn.socket.OPEN) {
        conn.socket.send(payload);
      }
    }
  }

  /** For events targeting one user regardless of server (e.g. SERVER_CREATE). */
  dispatchToUser(userId: string, event: WsEvent): void {
    const payload = JSON.stringify(event);
    for (const conn of this.connections) {
      if (conn.userId === userId && conn.socket.readyState === conn.socket.OPEN) {
        conn.socket.send(payload);
      }
    }
  }

  /** Re-evaluate every connected user's presence (called from heartbeatTick). */
  reevaluatePresence(): void {
    const byUser = new Map<string, ReadonlySet<string>>();
    for (const conn of this.connections) {
      byUser.set(conn.userId, conn.serverIds);
    }
    for (const [userId, serverIds] of byUser) this.refreshPresence(userId, serverIds);
  }

  *[Symbol.iterator](): IterableIterator<GatewayConnection> {
    yield* this.connections;
  }

  private isIdle(conn: GatewayConnection): boolean {
    return Date.now() - conn.lastActivityAt > IDLE_AFTER_MS;
  }

  /** A user is online with ≥1 connection; idle only if ALL connections are idle. */
  private statusOf(userId: string): PresenceStatus {
    let found = false;
    let allIdle = true;
    for (const conn of this.connections) {
      if (conn.userId !== userId) continue;
      found = true;
      if (!this.isIdle(conn)) allIdle = false;
    }
    if (!found) return "offline";
    return allIdle ? "idle" : "online";
  }

  /**
   * Announce a presence change to the user's servers. Never echoed back to the
   * user themself — they learn their own status from the READY snapshot.
   */
  private refreshPresence(userId: string, serverIds: ReadonlySet<string>): void {
    const status = this.statusOf(userId);
    const prev = this.announced.get(userId) ?? "offline";
    if (status === prev) return;
    if (status === "offline") this.announced.delete(userId);
    else this.announced.set(userId, status);
    for (const serverId of serverIds) {
      this.dispatchToServer(
        serverId,
        { type: "PRESENCE_UPDATE", data: { userId, status } },
        userId,
      );
    }
  }
}

/** One heartbeat pass: terminate connections that missed their pong, ping the rest. */
export function heartbeatTick(hub: Hub): void {
  for (const conn of hub) {
    if (!conn.isAlive) {
      conn.socket.terminate();
      continue;
    }
    conn.isAlive = false;
    conn.socket.ping();
  }
  // Idle transitions are only re-evaluated here (every 30s) — connect/disconnect
  // announces immediately on add/remove, but idle is allowed to lag one tick.
  hub.reevaluatePresence();
}
