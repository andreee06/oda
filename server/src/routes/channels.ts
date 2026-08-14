import type { FastifyPluginAsync } from "fastify";
import { RenameChannelBody } from "@oda/shared";
import { requireUser } from "../lib/guard.js";
import { deleteChannel, getChannelServerId, renameChannel } from "../services/channels.js";

export const channelsRoutes: FastifyPluginAsync = async (app) => {
  app.patch("/:id", async (req) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    const body = RenameChannelBody.parse(req.body);
    return renameChannel(user.id, id, body.name);
  });

  app.delete("/:id", async (req, reply) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    const serverId = await getChannelServerId(user.id, id);
    await deleteChannel(user.id, id);
    app.gateway.dispatchToServer(serverId, {
      type: "CHANNEL_DELETE",
      data: { id, serverId },
    });
    return reply.code(204).send();
  });
};
