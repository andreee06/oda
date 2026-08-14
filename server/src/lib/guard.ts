import type { FastifyRequest } from "fastify";
import { getSessionUser, SESSION_COOKIE } from "../services/auth.js";
import { ApiError } from "./errors.js";

/** Resolve the session user or throw 401. Use in every authenticated route. */
export async function requireUser(req: FastifyRequest) {
  const user = await getSessionUser(req.cookies[SESSION_COOKIE]);
  if (!user) throw new ApiError(401, "not authenticated");
  return user;
}
