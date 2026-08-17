import type { EmbedDTO } from "@oda/shared";

const URL_RE = /https?:\/\/[^\s<>"']+/g;
const MAX_URLS_PER_MESSAGE = 3;
const FETCH_TIMEOUT_MS = 3000;
const MAX_HTML_BYTES = 512 * 1024;

/** Best-effort OpenGraph unfurl for the first few links in a message. */
export async function unfurlUrls(content: string): Promise<EmbedDTO[]> {
  const urls = [...content.matchAll(URL_RE)]
    .map((m) => m[0])
    .slice(0, MAX_URLS_PER_MESSAGE);
  const results = await Promise.all(urls.map(unfurl));
  return results.filter((e): e is EmbedDTO => e !== null);
}

function og(html: string, property: string): string | null {
  const match =
    html.match(
      new RegExp(
        `<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']+)["']`,
        "i",
      ),
    ) ??
    html.match(
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${property}["']`,
        "i",
      ),
    );
  return match?.[1] ?? null;
}

async function unfurl(url: string): Promise<EmbedDTO | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("text/html")) return null;

    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    const title = og(html, "title");
    const description = og(html, "description");
    const imageUrl = og(html, "image");
    if (!title && !description && !imageUrl) return null;
    return { url, title, description, imageUrl };
  } catch {
    return null; // dead/slow links just don't get an embed — never block chat
  }
}
