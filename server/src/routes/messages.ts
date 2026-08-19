import type { FastifyPluginAsync } from "fastify";
import { CreateMessageBody, GetMessagesQuery } from "@oda/shared";
import { requireUser } from "../lib/guard.js";
import { createMessage, listMessages } from "../services/messages.js";

/** Registered under the /api/channels prefix alongside channelsRoutes. */
export const messagesRoutes: FastifyPluginAsync = async (app) => {
  app.post("/:id/messages", async (req, reply) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    const body = CreateMessageBody.parse(req.body);

    const message = await createMessage(user.id, id, body);
    app.gateway.touch(user.id); // posting counts as presence activity
    app.gateway.dispatchToChannel(id, {
      type: "MESSAGE_CREATE",
      data: message,
    });
    return reply.code(201).send(message);
  });

  app.get("/:id/messages", async (req) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    const query = GetMessagesQuery.parse(req.query);
    return listMessages(user.id, id, query);
  });
};
