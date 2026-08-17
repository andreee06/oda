import type { FastifyPluginAsync } from "fastify";
import type { GifResultDTO } from "@oda/shared";
import { requireUser } from "../lib/guard.js";
import { ApiError } from "../lib/errors.js";
import { config } from "../lib/config.js";

interface GiphyResult {
  id: string;
  images?: Record<string, { url?: string } | undefined>;
}

export const gifsRoutes: FastifyPluginAsync = async (app) => {
  // Proxied server-side so the GIPHY key never reaches the browser.
  app.get("/search", async (req) => {
    await requireUser(req);
    const { q } = req.query as { q?: string };
    if (!q?.trim()) throw new ApiError(400, "missing query param q");
    if (!config.GIPHY_API_KEY) {
      throw new ApiError(503, "gif search is not configured on this server");
    }

    const url =
      `https://api.giphy.com/v1/gifs/search?q=${encodeURIComponent(q)}` +
      `&api_key=${config.GIPHY_API_KEY}&limit=24&rating=pg-13`;
    const res = await fetch(url);
    if (!res.ok) throw new ApiError(502, "gif upstream error");

    const data = (await res.json()) as { data?: GiphyResult[] };
    const results: GifResultDTO[] = (data.data ?? [])
      .map((r) => ({
        id: r.id,
        // fixed_height (~200px) is plenty for inline chat; original can be huge
        url: r.images?.fixed_height?.url ?? r.images?.original?.url ?? "",
        previewUrl:
          r.images?.fixed_height_small?.url ??
          r.images?.fixed_height?.url ??
          "",
      }))
      .filter((r) => r.url);
    return { results };
  });
};
