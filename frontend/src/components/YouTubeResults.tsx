"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { YouTubePreview } from "@/components/YouTubePreview";

export type YoutubeHit = {
  id: string;
  title: string;
  artist: string;
  channel?: string;
  duration_seconds?: number | null;
  thumbnail_url?: string | null;
  url: string;
  raw_title?: string;
};

type SearchResponse = {
  query: string;
  results: YoutubeHit[];
  offset: number;
  has_more: boolean;
};

type Props = {
  query: string;
  heading?: string;
  /** Page size for each fetch. */
  pageSize?: number;
  onQueued?: (jobId: number) => void;
  className?: string;
};

export function YouTubeResults({ query, heading = "YouTube", pageSize = 12, onQueued, className }: Props) {
  const [results, setResults] = useState<YoutubeHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [queued, setQueued] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const abortRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);

  const fetchPage = useCallback(
    async (q: string, offset: number, append: boolean, token: number) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await api<SearchResponse>(
          `/api/v1/youtube/search?q=${encodeURIComponent(q)}&limit=${pageSize}&offset=${offset}&exclude_owned=true`
        );
        if (token !== abortRef.current) return;
        setResults((prev) => (append ? [...prev, ...(res.results || [])] : res.results || []));
        setHasMore(!!res.has_more);
        offsetRef.current = offset + (res.results?.length || 0);
      } catch (e) {
        if (token !== abortRef.current) return;
        if (!append) setResults([]);
        setError(e instanceof Error ? e.message : "YouTube search failed");
        setHasMore(false);
      } finally {
        if (token === abortRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [pageSize]
  );

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setError(null);
      setHasMore(false);
      offsetRef.current = 0;
      return;
    }
    const token = ++abortRef.current;
    offsetRef.current = 0;
    setPreviewId(null);
    void fetchPage(q, 0, false, token);
  }, [query, fetchPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        const q = query.trim();
        if (!q || loading || loadingMore || !hasMore) return;
        const token = abortRef.current;
        void fetchPage(q, offsetRef.current, true, token);
      },
      { rootMargin: "240px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [query, loading, loadingMore, hasMore, fetchPage]);

  async function download(hit: YoutubeHit) {
    setBusyId(hit.id);
    try {
      const res = await api<{ job_id: number }>("/api/v1/downloads", {
        method: "POST",
        body: JSON.stringify({
          url: hit.url,
          title: hit.title,
          artist: hit.artist,
          added_via: "youtube_search",
        }),
      });
      setQueued((prev) => new Set(prev).add(hit.id));
      setResults((prev) => prev.filter((r) => r.id !== hit.id));
      onQueued?.(res.job_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusyId(null);
    }
  }

  if (query.trim().length < 2) return null;

  return (
    <section className={className}>
      <div className="flex items-end justify-between gap-3 mb-3">
        <h3 className="text-xl font-bold">{heading}</h3>
        {loading && <span className="text-xs text-muted">Searching YouTube…</span>}
      </div>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      {!loading && !error && results.length === 0 && (
        <p className="text-sm text-muted">No YouTube results (or everything matching is already in your library).</p>
      )}
      <ul className="space-y-1">
        {results.map((hit) => {
          const isPreview = previewId === hit.id;
          const isQueued = queued.has(hit.id);
          return (
            <li key={hit.id} className="rounded-md hover:bg-white/5">
              <div className="flex items-center gap-3 px-2 py-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setPreviewId(isPreview ? null : hit.id)}
                  className="relative w-12 h-12 shrink-0 rounded overflow-hidden bg-[#282828] group/thumb"
                  aria-label={isPreview ? "Stop preview" : `Preview ${hit.title}`}
                >
                  {hit.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={hit.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="flex w-full h-full items-center justify-center text-muted text-xs">YT</span>
                  )}
                  <span className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-xs font-bold opacity-0 group-hover/thumb:opacity-100">
                    {isPreview ? "■" : "▶"}
                  </span>
                </button>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="font-medium truncate text-sm">{hit.title}</p>
                  <p className="text-xs text-muted truncate">
                    {hit.artist}
                    {hit.channel && hit.channel !== hit.artist ? ` · ${hit.channel}` : ""}
                    {hit.duration_seconds != null ? ` · ${formatDuration(hit.duration_seconds)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setPreviewId(isPreview ? null : hit.id)}
                    className={`text-xs px-3 py-1.5 rounded-full ${
                      isPreview ? "bg-white text-black" : "bg-white/10 hover:bg-white/15"
                    }`}
                  >
                    {isPreview ? "Stop" : "Preview"}
                  </button>
                  <button
                    type="button"
                    disabled={!!busyId || isQueued}
                    onClick={() => void download(hit)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full bg-spotify text-black disabled:opacity-40"
                  >
                    {isQueued ? "Queued" : busyId === hit.id ? "…" : "Download"}
                  </button>
                </div>
              </div>
              {isPreview && (
                <YouTubePreview videoId={hit.id} title={hit.title} onClose={() => setPreviewId(null)} />
              )}
            </li>
          );
        })}
      </ul>
      <div ref={sentinelRef} className="h-4" />
      {loadingMore && <p className="text-xs text-muted py-2">Loading more…</p>}
      {!loading && !loadingMore && hasMore && (
        <button
          type="button"
          className="text-sm text-spotify font-semibold py-2"
          onClick={() => {
            const q = query.trim();
            void fetchPage(q, offsetRef.current, true, abortRef.current);
          }}
        >
          Load more
        </button>
      )}
    </section>
  );
}
