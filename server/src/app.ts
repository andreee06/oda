import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import { ZodError } from "zod";
import { ApiError } from "./lib/errors.js";
import { authRoutes } from "./routes/auth.js";
import { serversRoutes } from "./routes/servers.js";
import { channelsRoutes } from "./routes/channels.js";
import { messagesRoutes } from "./routes/messages.js";
import { gatewayPlugin } from "./gateway/index.js";
import { Hub } from "./gateway/hub.js";

export async function buildApp(options?: {
  logger?: boolean;
}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options?.logger ?? false });

  await app.register(cookie);
  await app.register(websocket);

  // CSRF guard: browsers can't set a custom header cross-origin without a
  // CORS preflight, so requiring one on every mutation kills classic CSRF.
  app.addHook("onRequest", async (req) => {
    if (req.method !== "GET" && req.headers["x-oda-client"] !== "web") {
      throw new ApiError(403, "missing client header");
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ApiError) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    if (err instanceof ZodError) {
      return reply
        .code(400)
        .send({ error: "validation failed", issues: err.issues });
    }
    app.log.error(err);
    return reply.code(500).send({ error: "internal server error" });
  });

  app.get("/api/health", async () => ({ status: "ok", service: "oda-server" }));

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(serversRoutes, { prefix: "/api/servers" });
  const hub = new Hub();
  app.decorate("gateway", hub);
  await app.register(channelsRoutes, { prefix: "/api/channels" });
  await app.register(messagesRoutes, { prefix: "/api/channels" });
  await app.register(gatewayPlugin, { hub });

  return app;
}
