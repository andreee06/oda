import type { FastifyPluginAsync } from "fastify";
import { WsClientMessage } from "@oda/shared";
import { getMe, getSessionUser, SESSION_COOKIE } from "../services/auth.js";
import { GatewayConnection } from "./connection.js";
import { heartbeatTick, Hub } from "./hub.js";

declare module "fastify" {
  interface FastifyInstance {
    gateway: Hub;
  }
}

export interface GatewayOptions {
  heartbeatMs?: number;
  /** Created and decorated at the root instance (register() encapsulates). */
  hub: Hub;
}

export const gatewayPlugin: FastifyPluginAsync<GatewayOptions> = async (
  app,
  opts,
) => {
  const hub = opts.hub;

  const interval = setInterval(
    () => heartbeatTick(hub),
    opts.heartbeatMs ?? 30_000,
  );
  interval.unref(); // never keep the process alive for heartbeats
  app.addHook("onClose", async () => clearInterval(interval));

  app.get("/ws", { websocket: true }, async (socket, req) => {
    const user = await getSessionUser(req.cookies[SESSION_COOKIE]);
    if (!user) {
      socket.close(4401, "unauthorized");
      return;
    }

    const me = await getMe(user.id);
    const conn = new GatewayConnection(socket, user.id);
    for (const server of me.servers) {
      conn.serverIds.add(server.id);
      for (const channel of server.channels) conn.channelIds.add(channel.id);
    }
    hub.add(conn);

    socket.on("pong", () => {
      conn.isAlive = true;
    });
    socket.on("message", (raw) => {
      let parsed: ReturnType<typeof WsClientMessage.safeParse>;
      try {
        parsed = WsClientMessage.safeParse(JSON.parse(raw.toString()));
      } catch {
        return; // malformed JSON — ignore, don't crash the connection
      }
      if (!parsed.success) return;
      if (parsed.data.type === "PING") {
        // keepalive only — does NOT count as presence activity
        conn.send({ type: "PONG", data: {} });
        return;
      }
      conn.lastActivityAt = Date.now();
      if (parsed.data.type === "TYPING_START") {
        const { channelId } = parsed.data.data;
        if (!conn.channelIds.has(channelId)) return; // not your channel
        if (!hub.allowTyping(user.id, channelId)) return; // throttled
        hub.dispatchToChannel(
          channelId,
          { type: "TYPING_START", data: { channelId, user: me.user } },
          user.id, // don't echo typing back to the typer
        );
      }
    });
    socket.on("close", () => hub.remove(conn));

    conn.send({
      type: "READY",
      data: { ...me, presences: hub.presenceSnapshot() },
    });
  });
};
