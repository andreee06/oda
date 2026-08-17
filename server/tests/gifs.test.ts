import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/db.js";
import { buildApp } from "../src/app.js";
import { cleanDb, setupUser } from "./helpers.js";

let app: FastifyInstance;

describe("GET /api/gifs/search", () => {
  beforeEach(async () => {
    await cleanDb();
    app = await buildApp({ logger: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns 503 when no GIPHY key is configured (dev default)", async () => {
    const { cookie } = await setupUser(app, "alice");
    const res = await app.inject({
      method: "GET",
      url: "/api/gifs/search?q=cat",
      cookies: { oda_session: cookie },
    });
    expect(res.statusCode).toBe(503);
  });

  it("maps GIPHY results to GifResultDTO when a key exists", async () => {
    const { config } = await import("../src/lib/config.js");
    (config as { GIPHY_API_KEY: string }).GIPHY_API_KEY = "test-key";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "123",
              images: {
                fixed_height: { url: "https://media.giphy.com/media/123/200.gif" },
                fixed_height_small: { url: "https://media.giphy.com/media/123/100.gif" },
              },
            },
          ],
        }),
      })),
    );

    const { cookie } = await setupUser(app, "alice");
    const res = await app.inject({
      method: "GET",
      url: "/api/gifs/search?q=cat",
      cookies: { oda_session: cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().results).toEqual([
      {
        id: "123",
        url: "https://media.giphy.com/media/123/200.gif",
        previewUrl: "https://media.giphy.com/media/123/100.gif",
      },
    ]);

    (config as { GIPHY_API_KEY: string }).GIPHY_API_KEY = "";
  });

  it("requires auth (401)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/gifs/search?q=x" });
    expect(res.statusCode).toBe(401);
  });
});
