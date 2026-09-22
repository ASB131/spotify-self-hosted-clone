"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, getApiUrl, type Track } from "@/lib/api";
import { usePlayerStore } from "@/store/player";
import { ArtistLinks } from "@/lib/artists";
import { WebSocketBridge } from "@/lib/ws";

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

export default function DiscoveryPage() {
  const params = useParams();
  const router = useRouter();
  const kind = String(params.kind || "");
  const [data, setData] = useState<DiscoveryPlaylist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const playTrackInContext = usePlayerStore((s) => s.playTrackInContext);
  const setTrack = usePlayerStore((s) => s.setTrack);

  const load = () => {
    if (!kind) return;
    api<DiscoveryPlaylist>(`/api/v1/discovery/${kind}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  };

  useEffect(() => {
    load();
  }, [kind]);

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

  async function playReady(item: DiscoveryItem) {
    if (!item.track_id) return;
    try {
      const track = await api<Track>(`/api/v1/tracks/${item.track_id}`);
      const ready = (data?.items || [])
        .filter((i) => i.track_id)
        .map((i) => ({ id: i.track_id!, title: i.title, artist: i.artist, format: "flac", file_size_bytes: 0 }));
      const full = ready.length
        ? await Promise.all(ready.map((r) => api<Track>(`/api/v1/tracks/${r.id}`).catch(() => null))).then((xs) =>
            xs.filter(Boolean) as Track[]
          )
        : [track];
      playTrackInContext(track, full.length ? full : [track]);
    } catch {
      setTrack(null);
    }
  }

  if (!["discover_weekly", "release_radar"].includes(kind)) {
    return <p className="text-sm text-muted">Unknown discovery playlist.</p>;
  }

  return (
    <>
      <WebSocketBridge
        onRefresh={() => {
          load();
        }}
      />
      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
      {data && (
        <div className="page-enter">
          <button type="button" onClick={() => router.push("/")} className="text-sm text-muted hover:text-white mb-4">
            ← Home
          </button>
          <div className="flex items-start justify-between gap-4 mb-8">
            <div>
              <h1 className="text-4xl font-black tracking-tight mb-2">{data.name}</h1>
              <p className="text-muted text-sm">
                {data.description} · Week {data.week_key}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await api("/api/v1/discovery/refresh", { method: "POST" });
                  setError(null);
                  setTimeout(load, 2500);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Refresh failed");
                }
              }}
              className="text-sm text-muted hover:text-white shrink-0 px-3 py-1.5 rounded-full border border-white/15"
            >
              Refresh
            </button>
          </div>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-muted border-b border-white/10 text-xs uppercase tracking-wider">
                <th className="w-10 font-normal text-right pr-3 py-2">#</th>
                <th className="font-normal text-left py-2">Title</th>
                <th className="font-normal text-left py-2 hidden md:table-cell">Album</th>
                <th className="font-normal text-right py-2 w-36 pr-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, i) => {
                const ready = item.status === "ready" && item.track_id;
                const downloading = item.status === "downloading" || busy === item.id;
                return (
                  <tr key={item.id} className="group h-14 hover:bg-white/[0.08] border-b border-transparent">
                    <td className="text-right pr-3 text-muted tabular-nums">{i + 1}</td>
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 shrink-0 rounded-sm bg-black/40 overflow-hidden">
                          {item.art_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`${getApiUrl()}${item.art_url}`} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="flex w-full h-full items-center justify-center text-muted text-xs">♪</span>
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
                        <p className="text-[10px] text-red-400 mt-1 truncate max-w-[9rem] ml-auto" title={item.error || ""}>
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
              No recommendations yet. Add songs to your library, then refresh — or wait for the weekly job.
            </p>
          )}
        </div>
      )}
    </>
  );
}
