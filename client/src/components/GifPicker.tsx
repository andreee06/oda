import { useEffect, useState } from "react";
import type { GifResultDTO, GifSearchResponse } from "@oda/shared";
import { api, ApiRequestError } from "../lib/api";

export default function GifPicker({
  onSelect,
}: {
  onSelect: (gifUrl: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GifResultDTO[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        setError(null);
        return;
      }
      try {
        const res = await api<GifSearchResponse>(
          `/api/gifs/search?q=${encodeURIComponent(query)}`,
        );
        setResults(res.results);
        setError(null);
      } catch (err) {
        setResults([]);
        setError(
          err instanceof ApiRequestError && err.status === 503
            ? "GIF search isn't configured on this server yet"
            : "GIF search failed",
        );
      }
    }, 350); // debounce
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="mb-2 w-96 max-w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search GIPHY…"
        className="mb-2 w-full rounded bg-zinc-800 px-2 py-1.5 text-sm outline-none placeholder:text-zinc-500 focus:ring-1 focus:ring-indigo-500"
      />
      {error && <p className="px-1 text-xs text-zinc-500">{error}</p>}
      {!error && results.length === 0 && (
        <p className="px-1 text-xs text-zinc-500">
          {query ? "No results" : "Type to search for GIFs"}
        </p>
      )}
      <div className="grid max-h-64 grid-cols-3 gap-1 overflow-y-auto">
        {results.map((gif) => (
          <button key={gif.id} onClick={() => onSelect(gif.url)}>
            <img
              src={gif.previewUrl}
              alt="gif"
              loading="lazy"
              className="h-24 w-full rounded object-cover hover:opacity-80"
            />
          </button>
        ))}
      </div>
      <p className="mt-1 px-1 text-right text-[10px] text-zinc-600">
        Powered by GIPHY
      </p>
    </div>
  );
}
