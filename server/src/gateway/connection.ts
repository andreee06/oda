import type { WebSocket } from "ws";
import type { WsEvent } from "@oda/shared";

/** One authenticated WebSocket connection (a user may have several). */
export class GatewayConnection {
  /** Flipped by heartbeatTick; set back to true on protocol-level pong. */
  isAlive = true;
  /** Channels this connection may receive events for (computed at connect). */
  readonly channelIds = new Set<string>();
  /** Servers this connection's user belongs to (for server-scoped events). */
  readonly serverIds = new Set<string>();

  constructor(
    public readonly socket: WebSocket,
    public readonly userId: string,
  ) {}

  send(event: WsEvent): void {
    if (this.socket.readyState === this.socket.OPEN) {
      this.socket.send(JSON.stringify(event));
    }
  }
}
