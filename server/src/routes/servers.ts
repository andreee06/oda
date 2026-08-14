import type { FastifyPluginAsync } from "fastify";
import { CreateChannelBody, CreateServerBody } from "@oda/shared";
import { requireUser } from "../lib/guard.js";
import {
  createServer,
  deleteServer,
  listMembers,
  listMyServers,
  renameServer,
} from "../services/servers.js";
import { createChannel } from "../services/channels.js";

export const serversRoutes: FastifyPluginAsync = async (app) => {
  app.post("/", async (req, reply) => {
    const user = await requireUser(req);
    const body = CreateServerBody.parse(req.body);
    const server = await createServer(user.id, body.name);
    return reply.code(201).send(server);
  });

  app.get("/mine", async (req) => {
    const user = await requireUser(req);
    return { servers: await listMyServers(user.id) };
  });

  app.get("/:id/members", async (req) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    return { members: await listMembers(user.id, id) };
  });

  app.patch("/:id", async (req) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    const body = CreateServerBody.parse(req.body);
    return renameServer(user.id, id, body.name);
  });

  app.delete("/:id", async (req, reply) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    await deleteServer(user.id, id);
    return reply.code(204).send();
  });

  app.post("/:id/channels", async (req, reply) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    const body = CreateChannelBody.parse(req.body);
    const channel = await createChannel(user.id, id, body);
    app.gateway.dispatchToServer(id, { type: "CHANNEL_CREATE", data: channel });
    return reply.code(201).send(channel);
  });
};
