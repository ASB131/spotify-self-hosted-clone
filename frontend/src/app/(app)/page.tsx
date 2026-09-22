"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, isAuthError, getApiUrl, type Playlist, type Track } from "@/lib/api";
import { WebSocketBridge } from "@/lib/ws";
import { fetchSetupStatus } from "@/lib/setup";
import { usePlayerStore } from "@/store/player";
import { ArtistLinks } from "@/lib/artists";
import { PlaylistGrid } from "@/components/PlaylistGrid";

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
};

export default function HomePage() {
  const router = useRouter();
  const playTrackInContext = usePlayerStore((s) => s.playTrackInContext);
  const [data, setData] = useState<HomeData | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    Promise.all([
      api<HomeData>("/api/v1/home"),
      api<Playlist[]>("/api/v1/playlists").catch(() => [] as Playlist[]),
    ])
      .then(([home, pls]) => {
        setData(home);
        setPlaylists(pls);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load home");
        if (isAuthError(e)) {
          router.replace("/login");
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
            <p className="text-sm text-muted mt-1">Your library and recent listens.</p>
          </header>

          <section>
            <div className="flex items-end justify-between mb-3">
              <h2 className="text-xl font-bold">Your playlists</h2>
              <Link href="/library" className="text-sm text-muted hover:text-white">
                Show all
              </Link>
            </div>
            <PlaylistGrid
              playlists={playlists.slice(0, 10)}
              emptyMessage="No playlists yet. Create one from Your Library."
              compact
              limit={10}
            />
          </section>

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
            <div className="flex items-end justify-between mb-3">
              <h2 className="text-xl font-bold">Recently played</h2>
              <Link href="/history" className="text-sm text-muted hover:text-white">
                Full history
              </Link>
            </div>
            {data.recently_played_tracks.length === 0 && data.recently_played_playlists.length === 0 ? (
              <p className="text-sm text-muted">Play something. It will show up here.</p>
            ) : (
              <div className="min-w-0 overflow-x-auto">
                <div className="flex gap-4 pb-2">
                  {data.recently_played_playlists.slice(0, 4).map((p) => (
                    <Link key={`pl-${p.id}`} href={`/playlist/${p.id}`} className="w-36 shrink-0 group">
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
                  {data.recently_played_tracks.slice(0, 8).map((t) => (
                    <button
                      key={`t-${t.id}`}
                      type="button"
                      onClick={() => playTrackInContext(t, data.recently_played_tracks.slice(0, 8))}
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
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
