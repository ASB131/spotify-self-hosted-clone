"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getApiUrl, type Playlist, type Track } from "@/lib/api";
import { WebSocketBridge } from "@/lib/ws";
import { fetchSetupStatus } from "@/lib/setup";
import { usePlayerStore } from "@/store/player";
import { ArtistLinks } from "@/lib/artists";

type DiscoveryItem = {
  id: number;
  title: string;
  artist: string;
  album?: string | null;
  status: string;
  track_id?: number | null;
  art_url?: string | null;
};

type DiscoveryPlaylist = {
  kind: string;
  name: string;
  description: string;
  week_key: string;
  item_count: number;
  items: DiscoveryItem[];
};

type RecentPlaylist = {
  id: number;
  name: string;
  is_liked_songs: boolean;
  cover_url?: string | null;
};

type HomeData = {
  all_songs: Playlist | null;
  recently_played_tracks: Track[];
  recently_played_playlists: RecentPlaylist[];
  discover_weekly: DiscoveryPlaylist;
  release_radar: DiscoveryPlaylist;
};

export default function HomePage() {
  const router = useRouter();
  const playTrackInContext = usePlayerStore((s) => s.playTrackInContext);
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api<HomeData>("/api/v1/home")
      .then(setData)
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load home");
        if (String(e).includes("401") || String(e).toLowerCase().includes("unauthorized")) {
          router.push("/login");
        }
      });
  };

  useEffect(() => {
    fetchSetupStatus()
      .then((s) => {
        if (s.needs_setup) {
          router.replace("/setup");
          return;
        }
        load();
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  return (
    <>
      <WebSocketBridge onRefresh={load} />
      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
      {!data ? (
        <p className="text-muted text-sm">Loading…</p>
      ) : (
        <div className="page-enter space-y-10 pb-8">
          <header>
            <h1 className="text-3xl font-black tracking-tight">Home</h1>
            <p className="text-sm text-muted mt-1">Your library, recent listens, and weekly discovery.</p>
          </header>

          {data.all_songs && (
            <section>
              <h2 className="text-xl font-bold mb-3">All Songs</h2>
              <Link
                href={`/playlist/${data.all_songs.id}`}
                className="flex items-center gap-4 max-w-md rounded-md p-3 hover:bg-white/10 transition-colors"
              >
                <span className="h-20 w-20 rounded shadow-lg bg-gradient-to-br from-[#450af5] to-[#8e8ee5] flex items-center justify-center text-3xl shrink-0">
                  ♪
                </span>
                <span className="min-w-0">
                  <span className="block font-bold text-white truncate">{data.all_songs.name}</span>
                  <span className="block text-sm text-muted">
                    {data.all_songs.track_count} song{data.all_songs.track_count === 1 ? "" : "s"}
                  </span>
                </span>
              </Link>
            </section>
          )}

          <section>
            <h2 className="text-xl font-bold mb-3">Recently played</h2>
            {data.recently_played_tracks.length === 0 && data.recently_played_playlists.length === 0 ? (
              <p className="text-sm text-muted">Play something — it will show up here.</p>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {data.recently_played_playlists.map((p) => (
                  <Link
                    key={`pl-${p.id}`}
                    href={`/playlist/${p.id}`}
                    className="w-36 shrink-0 group"
                  >
                    <div
                      className={`aspect-square rounded-md mb-2 overflow-hidden shadow-md ${
                        p.is_liked_songs
                          ? "bg-gradient-to-br from-[#450af5] to-[#8e8ee5] flex items-center justify-center text-3xl"
                          : "bg-[#282828]"
                      }`}
                    >
                      {p.is_liked_songs ? (
                        "♪"
                      ) : p.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`${getApiUrl()}${p.cover_url}`} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="flex w-full h-full items-center justify-center text-2xl text-muted">
                          {p.name.charAt(0)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold truncate group-hover:underline">{p.name}</p>
                    <p className="text-xs text-muted">Playlist</p>
                  </Link>
                ))}
                {data.recently_played_tracks.map((t) => (
                  <button
                    key={`t-${t.id}`}
                    type="button"
                    onClick={() => playTrackInContext(t, data.recently_played_tracks)}
                    className="w-36 shrink-0 text-left group"
                  >
                    <div className="aspect-square rounded-md mb-2 overflow-hidden bg-[#282828] shadow-md">
                      {t.art_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`${getApiUrl()}${t.art_url}`} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="flex w-full h-full items-center justify-center text-muted">♪</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold truncate group-hover:underline">{t.title}</p>
                    <ArtistLinks artist={t.artist} className="text-xs text-muted truncate block" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <MadeForYouCard playlist={data.discover_weekly} accent="from-[#1db954]/30 to-[#121212]" />
          <MadeForYouCard playlist={data.release_radar} accent="from-[#509bf5]/30 to-[#121212]" />
        </div>
      )}
    </>
  );
}

function MadeForYouCard({ playlist, accent }: { playlist: DiscoveryPlaylist; accent: string }) {
  const preview = playlist.items.slice(0, 4);
  return (
    <section>
      <div className="flex items-end justify-between gap-4 mb-3">
        <div>
          <h2 className="text-xl font-bold">{playlist.name}</h2>
          <p className="text-sm text-muted mt-0.5">{playlist.description}</p>
        </div>
        <Link href={`/discovery/${playlist.kind}`} className="text-sm text-muted hover:text-white shrink-0">
          Show all
        </Link>
      </div>
      <Link
        href={`/discovery/${playlist.kind}`}
        className={`flex gap-4 rounded-lg p-4 bg-gradient-to-br ${accent} border border-white/5 hover:border-white/15 transition-colors`}
      >
        <div className="grid grid-cols-2 grid-rows-2 w-28 h-28 rounded overflow-hidden shrink-0 bg-black/40">
          {preview.length
            ? preview.map((i) => {
                const src = i.art_url?.startsWith("http")
                  ? i.art_url
                  : i.art_url
                    ? `${getApiUrl()}${i.art_url}`
                    : null;
                return src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i.id} src={src} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span key={i.id} className="bg-white/5 flex items-center justify-center text-xs text-muted">
                    ♪
                  </span>
                );
              })
            : (
              <span className="col-span-2 row-span-2 flex items-center justify-center text-muted text-2xl">♪</span>
            )}
        </div>
        <div className="min-w-0 flex flex-col justify-center">
          <p className="font-bold text-lg">{playlist.name}</p>
          <p className="text-sm text-muted mt-1">
            {playlist.item_count} song{playlist.item_count === 1 ? "" : "s"} · Week {playlist.week_key}
          </p>
          <ul className="mt-2 space-y-0.5 text-sm text-muted">
            {playlist.items.slice(0, 3).map((i) => (
              <li key={i.id} className="truncate">
                {i.artist} — {i.title}
              </li>
            ))}
          </ul>
        </div>
      </Link>
    </section>
  );
}
