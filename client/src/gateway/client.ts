import { WsEvent } from "@oda/shared";
import { useAppStore } from "../stores/app";

/**
 * WebSocket gateway client: reconnect with exponential backoff,
 * app-level PING keepalive, all events parsed through @oda/shared schemas.
 */
class GatewayClient {
  private ws: WebSocket | null = null;
  private retries = 0;
  private pingTimer: number | undefined;
  private intentionalClose = false;

  connect(): void {
    this.intentionalClose = false;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${proto}://${window.location.host}/ws`);
    this.ws = socket;
    useAppStore.getState().setConnectionStatus("connecting");

    socket.onopen = () => {
      this.retries = 0;
      useAppStore.getState().setConnectionStatus("online");
      this.pingTimer = window.setInterval(() => {
        socket.send(JSON.stringify({ type: "PING" }));
      }, 25_000);
    };

    socket.onmessage = (event) => {
      let parsed: ReturnType<typeof WsEvent.safeParse>;
      try {
        parsed = WsEvent.safeParse(JSON.parse(String(event.data)));
      } catch {
        return;
      }
      if (parsed.success) this.handle(parsed.data);
    };

    socket.onclose = () => {
      if (this.ws !== socket) return; // stale socket from a previous mount
      window.clearInterval(this.pingTimer);
      useAppStore.getState().setConnectionStatus("disconnected");
      if (!this.intentionalClose) {
        const delay = Math.min(1000 * 2 ** this.retries++, 15_000);
        window.setTimeout(() => this.connect(), delay);
      }
    };
  }

  private handle(event: WsEvent): void {
    const store = useAppStore.getState();
    switch (event.type) {
      case "READY":
        store.setSession(event.data.user, event.data.servers);
        store.setPresences(event.data.presences);
        break;
      case "MESSAGE_CREATE":
        store.addMessage(event.data);
        break;
      case "CHANNEL_CREATE":
        store.addChannel(event.data);
        break;
      case "CHANNEL_DELETE":
        store.removeChannel(event.data.id);
        break;
      case "SERVER_CREATE":
        store.addServer(event.data);
        break;
      case "USER_UPDATE":
        store.updateUser(event.data.user);
        break;
      case "PRESENCE_UPDATE":
        store.setPresence(event.data.userId, event.data.status);
        break;
      case "TYPING_START":
        store.addTyping(event.data.channelId, event.data.user);
        break;
      case "PONG":
        break;
    }
  }

  private typingSentAt = new Map<string, number>();

  /** Send TYPING_START, max once per 2s per channel (server throttles too). */
  sendTyping(channelId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const last = this.typingSentAt.get(channelId) ?? 0;
    if (Date.now() - last < 2_000) return;
    this.typingSentAt.set(channelId, Date.now());
    this.ws.send(JSON.stringify({ type: "TYPING_START", data: { channelId } }));
  }

  close(): void {
    this.intentionalClose = true;
    window.clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
  }
}

export const gateway = new GatewayClient();
