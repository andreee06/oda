import type { FastifyPluginAsync } from "fastify";
import { SetAvatarBody } from "@oda/shared";
import { requireUser } from "../lib/guard.js";
import { getServerIdsOfUser, setAvatar } from "../services/users.js";

export const usersRoutes: FastifyPluginAsync = async (app) => {
  app.patch("/me/avatar", async (req) => {
    const user = await requireUser(req);
    const body = SetAvatarBody.parse(req.body);
    const updated = await setAvatar(user.id, body.avatarUrl);

    // tell everyone sharing a server with this user (member lists, etc.)
    const event = { type: "USER_UPDATE", data: { user: updated } } as const;
    for (const serverId of await getServerIdsOfUser(user.id)) {
      app.gateway.dispatchToServer(serverId, event);
    }
    return { user: updated };
  });
};
