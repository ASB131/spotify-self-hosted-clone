"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, getApiUrl, type Track } from "@/lib/api";
import { usePlayerStore } from "@/store/player";
import { ArtistLinks } from "@/lib/artists";
import { WebSocketBridge } from "@/lib/ws";
import { CollectionHero, formatTotalDuration } from "@/components/CollectionHero";
import { formatDuration } from "@/lib/format";

type DiscoveryItem = {
  id: number;
  title: string;
  artist: string;
  album?: string | null;
  duration_ms?: number | null;
  status: string;
  track_id?: number | null;
  art_url?: string | null;
  error?: string | null;
  acquire_via?: string | null;
};

type DiscoveryPlaylist = {
  kind: string;
  name: string;
  description: string;
  week_key: string;
  item_count: number;
  items: DiscoveryItem[];
};

function resolveArt(url?: string | null) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${getApiUrl()}${url}`;
}

export default function DiscoveryPage() {
  const params = useParams();
  const router = useRouter();
  const kind = String(params.kind || "");
  const [data, setData] = useState<DiscoveryPlaylist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const playTrackInContext = usePlayerStore((s) => s.playTrackInContext);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);

  const load = () => {
    if (!kind) return;
    api<DiscoveryPlaylist>(`/api/v1/discovery/${kind}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  };

  useEffect(() => {
    load();
  }, [kind]);

  const totalSec = useMemo(
    () =>
      (data?.items || []).reduce((acc, i) => {
        if (i.duration_ms) return acc + i.duration_ms / 1000;
        return acc;
      }, 0),
    [data]
  );

  const readyCount = data?.items.filter((i) => i.status === "ready" && i.track_id).length || 0;
  const pendingCount =
    data?.items.filter((i) => i.status === "available" || i.status === "failed").length || 0;

  async function downloadItem(id: number) {
    setBusy(id);
    try {
      await api(`/api/v1/discovery/items/${id}/download`, { method: "POST" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(null);
    }
  }

  async function downloadAll() {
    setDownloadingAll(true);
    try {
      const res = await api<{ queued: number }>(`/api/v1/discovery/${kind}/download-all`, {
        method: "POST",
      });
      setError(res.queued ? `Queued ${res.queued} download(s)…` : null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download all failed");
    } finally {
      setDownloadingAll(false);
    }
  }

  async function playReady(item: DiscoveryItem) {
    if (!item.track_id || !data) return;
    const readyIds = data.items.filter((i) => i.track_id).map((i) => i.track_id!);
    const tracks = (
      await Promise.all(readyIds.map((id) => api<Track>(`/api/v1/tracks/${id}`).catch(() => null)))
    ).filter(Boolean) as Track[];
    const start = tracks.find((t) => t.id === item.track_id);
    if (start) playTrackInContext(start, tracks);
  }

  async function playAllReady() {
    if (!data) return;
    const readyIds = data.items.filter((i) => i.track_id).map((i) => i.track_id!);
    if (!readyIds.length) return;
    const tracks = (
      await Promise.all(readyIds.map((id) => api<Track>(`/api/v1/tracks/${id}`).catch(() => null)))
    ).filter(Boolean) as Track[];
    if (!tracks.length) return;
    let list = tracks;
    if (shuffle) {
      list = [...tracks];
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    }
    setQueue(list, 0);
  }

  if (!["discover_weekly", "release_radar"].includes(kind)) {
    return <p className="text-sm text-muted">Unknown discovery playlist.</p>;
  }

  const gradient =
    kind === "discover_weekly"
      ? "linear-gradient(180deg, #6b1f3a 0%, #3a1530 40%, #121212 100%)"
      : "linear-gradient(180deg, #1a3a5c 0%, #122530 40%, #121212 100%)";

  const arts = (data?.items || [])
    .map((i) => resolveArt(i.art_url))
    .filter(Boolean)
    .slice(0, 4) as string[];

  return (
    <>
      <WebSocketBridge onRefresh={load} />
      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
      {data && (
        <div className="page-enter">
          <CollectionHero
            kind="Public Playlist"
            title={data.name}
            gradient={gradient}
            artUrls={arts}
            subtitle={
              <>
                <span className="text-white/90">{data.description}</span>
                <span className="text-white/50">·</span>
                <span className="text-white/70">
                  {data.item_count} song{data.item_count === 1 ? "" : "s"}
                  {totalSec > 0 ? `, ${formatTotalDuration(totalSec)}` : ""}
                  {readyCount ? ` · ${readyCount} ready` : ""}
                </span>
              </>
            }
            onPlay={readyCount ? playAllReady : undefined}
            shuffleActive={shuffle}
            onShuffle={toggleShuffle}
            actions={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={downloadAll}
                  disabled={downloadingAll || pendingCount === 0}
                  className="text-muted hover:text-white p-2 disabled:opacity-40"
                  title="Download all"
                  aria-label="Download all"
                >
                  <DownloadIcon />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await api("/api/v1/discovery/refresh", { method: "POST" });
                      setTimeout(load, 3000);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Refresh failed");
                    }
                  }}
                  className="text-sm text-muted hover:text-white px-3 py-1.5"
                >
                  Refresh
                </button>
              </div>
            }
          />

          <table className="w-full text-sm border-collapse mt-2">
            <thead>
              <tr className="text-muted border-b border-white/10 text-xs uppercase tracking-wider">
                <th className="w-10 font-normal text-right pr-3 py-2">#</th>
                <th className="font-normal text-left py-2">Title</th>
                <th className="font-normal text-left py-2 hidden md:table-cell">Album</th>
                <th className="font-normal text-right py-2 w-16 hidden sm:table-cell">
                  <ClockIcon />
                </th>
                <th className="font-normal text-right py-2 w-36 pr-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, i) => {
                const ready = item.status === "ready" && item.track_id;
                const downloading = item.status === "downloading" || busy === item.id;
                const cover = resolveArt(item.art_url);
                const dur =
                  item.duration_ms != null
                    ? formatDuration(Math.round(item.duration_ms / 1000))
                    : "—";
                return (
                  <tr key={item.id} className="group h-14 hover:bg-white/[0.08]">
                    <td className="text-right pr-3 text-muted tabular-nums">{i + 1}</td>
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 shrink-0 rounded-sm bg-black/40 overflow-hidden">
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cover} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="flex w-full h-full items-center justify-center text-muted text-xs">
                              ♪
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          {ready ? (
                            <button
                              type="button"
                              onClick={() => playReady(item)}
                              className="block truncate text-left hover:underline text-white"
                            >
                              {item.title}
                            </button>
                          ) : (
                            <span className="block truncate text-white/80">{item.title}</span>
                          )}
                          <ArtistLinks artist={item.artist} className="block truncate text-sm text-muted" />
                        </div>
                      </div>
                    </td>
                    <td className="py-2 text-muted hidden md:table-cell truncate">{item.album || "—"}</td>
                    <td className="py-2 text-muted text-right tabular-nums hidden sm:table-cell">{dur}</td>
                    <td className="py-2 text-right pr-2">
                      {ready ? (
                        <span className="text-xs text-spotify font-medium">Ready</span>
                      ) : downloading ? (
                        <span className="text-xs text-muted">Downloading…</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => downloadItem(item.id)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white text-black hover:scale-105 transition-transform"
                        >
                          Download
                        </button>
                      )}
                      {item.status === "failed" && (
                        <p
                          className="text-[10px] text-red-400 mt-1 truncate max-w-[9rem] ml-auto"
                          title={item.error || ""}
                        >
                          Failed
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data.items.length === 0 && (
            <p className="text-sm text-muted py-8">
              No recommendations yet. Add songs to your library, then hit Refresh.
            </p>
          )}
        </div>
      )}
    </>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-6 h-6" fill="currentColor" aria-hidden>
      <path d="M4.5 1.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 .5.5v3h1.5a.5.5 0 0 1 .35.85l-4.5 4.5a.5.5 0 0 1-.7 0l-4.5-4.5A.5.5 0 0 1 4.5 4.5H6v-3zM2 13.5A.5.5 0 0 1 2.5 13h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 inline-block opacity-70" aria-hidden>
      <path
        fill="currentColor"
        d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8.75-3.25v3.5l2.5 1.5-.75 1.25L7.25 9V4.75h1.5z"
      />
    </svg>
  );
}
