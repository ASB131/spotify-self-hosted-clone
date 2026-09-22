"use client";

import { useEffect, useState } from "react";
import { api, artUrl, type Track } from "@/lib/api";
import { formatRelativeDate } from "@/lib/format";
import { ArtistLinks } from "@/lib/artists";
import { usePlayerStore } from "@/store/player";

type PlayItem = {
  track: Track;
  playlist_id?: number | null;
  played_at: string;
};

type HistoryResponse = {
  items: PlayItem[];
  total: number;
  limit: number;
  offset: number;
};

export default function HistoryPage() {
  const playTrackInContext = usePlayerStore((s) => s.playTrackInContext);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 40;

  useEffect(() => {
    api<HistoryResponse>(`/api/v1/me/plays?limit=${limit}&offset=${offset}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load history"));
  }, [offset]);

  const items = data?.items || [];
  const context = items.map((i) => i.track);

  return (
    <div className="max-w-3xl space-y-6 pb-10">
      <header>
        <h1 className="text-3xl font-black tracking-tight">Listening history</h1>
        <p className="text-sm text-muted mt-1">Chronological plays across your library.</p>
      </header>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!data ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">No plays recorded yet.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, idx) => {
            const cover = artUrl(item.track);
            return (
              <li key={`${item.track.id}-${item.played_at}-${idx}`}>
                <button
                  type="button"
                  onClick={() => playTrackInContext(item.track, context, item.playlist_id)}
                  className="w-full flex items-center gap-3 rounded-md px-2 py-2 hover:bg-white/5 text-left"
                >
                  <span className="w-12 h-12 shrink-0 rounded-sm overflow-hidden bg-white/10">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="flex w-full h-full items-center justify-center text-muted text-xs">♪</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{item.track.title}</span>
                    <ArtistLinks artist={item.track.artist} className="block truncate text-xs text-muted" />
                  </span>
                  <span className="text-xs text-muted shrink-0">{formatRelativeDate(item.played_at)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {data && data.total > limit && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={offset <= 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="px-3 py-1.5 rounded-full bg-white/10 text-sm disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={offset + limit >= data.total}
            onClick={() => setOffset(offset + limit)}
            className="px-3 py-1.5 rounded-full bg-white/10 text-sm disabled:opacity-40"
          >
            Next
          </button>
          <span className="text-xs text-muted self-center">
            {offset + 1}–{Math.min(offset + limit, data.total)} of {data.total}
          </span>
        </div>
      )}
    </div>
  );
}
