import type { FastifyPluginAsync } from "fastify";
import { VoiceStateBody, type VoiceParticipantDTO } from "@oda/shared";
import { AccessToken } from "livekit-server-sdk";
import { requireUser } from "../lib/guard.js";
import { ApiError } from "../lib/errors.js";
import { config } from "../lib/config.js";
import { toUserDTO } from "../lib/dto.js";
import { getChannelForMember } from "../services/messages.js";

/** Registered under /api/channels. LiveKit owns audio; we own the roster. */
export const voiceRoutes: FastifyPluginAsync = async (app) => {
  function broadcast(channelId: string, serverId: string, roster: VoiceParticipantDTO[]) {
    app.gateway.dispatchToServer(serverId, {
      type: "VOICE_STATE",
      data: { channelId, participants: roster },
    });
  }

  app.post("/:id/voice/join", async (req) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    const channel = await getChannelForMember(id, user.id); // 404 non-member
    if (channel.type !== "voice") throw new ApiError(400, "not a voice channel");

    const roster = app.voice.join(channel.id, channel.serverId, toUserDTO(user));

    const token = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
      identity: user.id,
      name: user.displayName,
    });
    token.addGrant({
      roomJoin: true,
      room: channel.id,
      canPublish: true,
      canSubscribe: true,
    });

    broadcast(channel.id, channel.serverId, roster);
    return { token: await token.toJwt(), url: config.LIVEKIT_URL };
  });

  app.post("/:id/voice/leave", async (req, reply) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    const channel = await getChannelForMember(id, user.id);
    const roster = app.voice.leave(channel.id, user.id);
    if (roster) broadcast(channel.id, channel.serverId, roster);
    return reply.code(204).send();
  });

  app.post("/:id/voice/state", async (req, reply) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    const channel = await getChannelForMember(id, user.id);
    const body = VoiceStateBody.parse(req.body);
    const roster = app.voice.setState(channel.id, user.id, body);
    if (!roster) throw new ApiError(409, "not in this voice channel");
    broadcast(channel.id, channel.serverId, roster);
    return reply.code(204).send();
  });
};
