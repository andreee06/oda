import type { FastifyPluginAsync } from "fastify";
import { CreateInviteBody } from "@oda/shared";
import { requireUser } from "../lib/guard.js";
import {
  acceptInvite,
  createInvite,
  listInvites,
  previewInvite,
  revokeInvite,
} from "../services/invites.js";

/** Owner-only invite management. Registered under /api/servers. */
export const inviteServerRoutes: FastifyPluginAsync = async (app) => {
  app.post("/:id/invites", async (req, reply) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    const body = CreateInviteBody.parse(req.body ?? {});
    const invite = await createInvite(user.id, id, body);
    return reply.code(201).send(invite);
  });

  app.get("/:id/invites", async (req) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    return { invites: await listInvites(user.id, id) };
  });

  app.delete("/:id/invites/:code", async (req, reply) => {
    const user = await requireUser(req);
    const { id, code } = req.params as { id: string; code: string };
    await revokeInvite(user.id, id, code);
    return reply.code(204).send();
  });
};

/** Public-ish link flow (still requires a logged-in user). Registered under /api/invites. */
export const inviteLinkRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:code", async (req) => {
    await requireUser(req);
    const { code } = req.params as { code: string };
    return previewInvite(code);
  });

  app.post("/:code/accept", async (req) => {
    const user = await requireUser(req);
    const { code } = req.params as { code: string };
    const server = await acceptInvite(user.id, code);
    // Live-update the acceptor's other tabs. Note: their gateway connection
    // subscribed to this server's channels only on NEXT reconnect — fine at
    // friends scale (same staleness as slice-1 CHANNEL_CREATE had).
    app.gateway.dispatchToUser(user.id, { type: "SERVER_CREATE", data: server });
    return server;
  });
};
