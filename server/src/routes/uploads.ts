import type { FastifyPluginAsync } from "fastify";
import { requireUser } from "../lib/guard.js";
import { ApiError } from "../lib/errors.js";
import { uploadFile } from "../services/storage.js";

export const uploadsRoutes: FastifyPluginAsync = async (app) => {
  app.post("/", async (req, reply) => {
    await requireUser(req);
    const file = await req.file();
    if (!file) throw new ApiError(400, "no file in request");
    const data = await file.toBuffer(); // 8MB cap set at plugin registration
    const url = await uploadFile(data, file.mimetype);
    return reply.code(201).send({ url });
  });
};
