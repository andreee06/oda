import type { WsEvent } from "@oda/shared";
import type { GatewayConnection } from "./connection.js";

/** Registry of all live connections. In-process by design (SPEC v1, no Redis). */
export class Hub {
  private readonly connections = new Set<GatewayConnection>();

  add(conn: GatewayConnection): void {
    this.connections.add(conn);
  }

  remove(conn: GatewayConnection): void {
    this.connections.delete(conn);
  }

  get size(): number {
    return this.connections.size;
  }

  /** Serialize once, send to every connection subscribed to the channel. */
  dispatchToChannel(channelId: string, event: WsEvent): void {
    const payload = JSON.stringify(event);
    for (const conn of this.connections) {
      if (conn.channelIds.has(channelId) && conn.socket.readyState === conn.socket.OPEN) {
        conn.socket.send(payload);
      }
    }
  }

  /** For events about server-level changes (new/deleted channels, etc.). */
  dispatchToServer(serverId: string, event: WsEvent): void {
    const payload = JSON.stringify(event);
    for (const conn of this.connections) {
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

  *[Symbol.iterator](): IterableIterator<GatewayConnection> {
    yield* this.connections;
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
}
