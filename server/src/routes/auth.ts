import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { LoginBody, RegisterBody } from "@oda/shared";
import { ApiError } from "../lib/errors.js";
import { toUserDTO } from "../lib/dto.js";
import {
  createSession,
  destroySession,
  getMe,
  getSessionUser,
  login,
  register,
  SESSION_COOKIE,
} from "../services/auth.js";

const COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

function setSessionCookie(reply: FastifyReply, token: string): void {
  void reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_S,
    secure: false, // dev over http; flip to true behind TLS (hosting slice)
  });
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/register", async (req, reply) => {
    const body = RegisterBody.parse(req.body);
    const user = await register(body);
    const token = await createSession(user.id);
    setSessionCookie(reply, token);
    return reply.code(201).send({ user: toUserDTO(user) });
  });

  app.post("/login", async (req, reply) => {
    const body = LoginBody.parse(req.body);
    const user = await login(body.username, body.password, req.ip);
    const token = await createSession(user.id);
    setSessionCookie(reply, token);
    return { user: toUserDTO(user) };
  });

  app.post("/logout", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await destroySession(token);
    void reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/me", async (req) => {
    const user = await getSessionUser(req.cookies[SESSION_COOKIE]);
    if (!user) throw new ApiError(401, "not authenticated");
    return getMe(user.id);
  });
};
