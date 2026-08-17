import type { ReactNode } from "react";

const IMAGE_URL_RE = /^https?:\/\/\S+\.(gif|png|jpe?g|webp)(\?\S*)?$/i;
const TOKEN_RE = /(https?:\/\/[^\s]+|:[a-z0-9_]{2,32}:)/g;
const SHORTCODE_RE = /^:[a-z0-9_]{2,32}:$/;

/** A message that's just an image link (GIF picker flow) renders as the image. */
export function isImageOnlyMessage(content: string): boolean {
  return IMAGE_URL_RE.test(content.trim());
}

/** Render message text: linkify URLs, swap :shortcode: for custom emoji. */
export function renderContent(
  content: string,
  emojiMap: Map<string, string>,
): ReactNode[] {
  return content.split(TOKEN_RE).map((part, i) => {
    if (SHORTCODE_RE.test(part)) {
      const url = emojiMap.get(part.slice(1, -1));
      if (url) {
        return (
          <img
            key={i}
            src={url}
            alt={part}
            title={part}
            className="inline h-6 w-6 align-text-bottom"
          />
        );
      }
    }
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="break-all text-indigo-400 hover:underline"
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
