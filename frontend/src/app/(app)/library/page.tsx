"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CollectionHero, formatTotalDuration } from "@/components/CollectionHero";
import { PlaylistGrid } from "@/components/PlaylistGrid";
import { TrackTable } from "@/components/TrackTable";
import { api, getApiUrl, type Playlist, type Track } from "@/lib/api";
import { ArtistLinks } from "@/lib/artists";
import { usePlayerStore } from "@/store/player";
import { WebSocketBridge } from "@/lib/ws";

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

export default function LibraryPage() {
  const router = useRouter();
  const playTrackInContext = usePlayerStore((s) => s.playTrackInContext);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [home, setHome] = useState<HomeData | null>(null);
  const [displayName, setDisplayName] = useState("You");

  const load = () =>
    Promise.all([
      api<Track[]>("/api/v1/tracks"),
      api<Playlist[]>("/api/v1/playlists"),
      api<HomeData>("/api/v1/home").catch(() => null),
      api<{ display_name: string }>("/api/v1/auth/me").catch(() => ({ display_name: "You" })),
    ])
      .then(([t, p, h, me]) => {
        setTracks(t);
        setPlaylists(p.filter((pl) => !pl.is_liked_playlist));
        setHome(h);
        setDisplayName(me.display_name || "You");
      })
      .catch(() => router.push("/login"));

  useEffect(() => {
    load();
  }, [router]);

  async function upgrade(id: number) {
    await api("/api/v1/tracks/upgrade-quality", {
      method: "POST",
      body: JSON.stringify({ track_id: id }),
    });
  }

  const allSongs = home?.all_songs || playlists.find((p) => p.is_liked_songs) || null;
  const otherPlaylists = playlists.filter((p) => !p.is_liked_songs && !p.is_liked_playlist);
  const totalSec = useMemo(
    () => tracks.reduce((acc, t) => acc + (t.duration_seconds || 0), 0),
    [tracks]
  );
  const arts = tracks.map((t) => t.art_url).filter(Boolean) as string[];
  const recentPlaylists = (home?.recently_played_playlists || []).filter((p) => !p.is_liked_songs);
  const recentTracks = home?.recently_played_tracks || [];

  return (
    <div className="min-w-0 max-w-full pb-8 space-y-10">
      <WebSocketBridge onRefresh={load} />
      <header>
        <h2 className="text-2xl font-bold">Your Library</h2>
        <p className="text-sm text-muted mt-1">Recently played, playlists, and every song you own.</p>
      </header>

      <section>
        <div className="flex items-end justify-between mb-3">
          <h3 className="text-lg font-semibold">Recently played</h3>
          <Link href="/history" className="text-sm text-muted hover:text-white">
            Full history
          </Link>
        </div>
        {recentTracks.length === 0 && recentPlaylists.length === 0 ? (
          <p className="text-sm text-muted">Play something. It will show up here.</p>
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <div className="flex gap-3 pb-2">
              {recentPlaylists.slice(0, 6).map((p) => (
                <Link key={`pl-${p.id}`} href={`/playlist/${p.id}`} className="w-28 shrink-0 group">
                  <div className="aspect-square rounded-md mb-1.5 overflow-hidden shadow-md bg-[#282828]">
                    {p.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`${getApiUrl()}${p.cover_url}`} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="flex w-full h-full items-center justify-center text-xl text-muted">
                        {p.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold truncate group-hover:underline">{p.name}</p>
                  <p className="text-[10px] text-muted">Playlist</p>
                </Link>
              ))}
              {recentTracks.slice(0, 10).map((t) => (
                <button
                  key={`t-${t.id}`}
                  type="button"
                  onClick={() => playTrackInContext(t, recentTracks.slice(0, 10))}
                  className="w-28 shrink-0 text-left group"
                >
                  <div className="aspect-square rounded-md mb-1.5 overflow-hidden bg-[#282828] shadow-md">
                    {t.art_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`${getApiUrl()}${t.art_url}`} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="flex w-full h-full items-center justify-center text-muted">♪</span>
                    )}
                  </div>
                  <p className="text-xs font-semibold truncate group-hover:underline">{t.title}</p>
                  <ArtistLinks artist={t.artist} className="text-[10px] text-muted truncate block" />
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-3">Playlists</h3>
        <PlaylistGrid
          playlists={otherPlaylists}
          emptyMessage="No playlists yet. Use Create in the sidebar."
          compact
          limit={18}
        />
      </section>

      {allSongs && (
        <section>
          <CollectionHero
            kind="Playlist"
            title={allSongs.name || "All Songs"}
            liked
            artUrls={arts}
            subtitle={
              <>
                <span className="inline-flex h-6 w-6 rounded-full bg-[#535353] items-center justify-center text-xs font-bold">
                  {displayName.charAt(0).toUpperCase()}
                </span>
                <span className="font-bold">{displayName}</span>
                <span className="text-white/70">·</span>
                <span className="text-white/70">
                  {tracks.length.toLocaleString()} song{tracks.length === 1 ? "" : "s"}
                  {totalSec > 0 ? `, ${formatTotalDuration(totalSec)}` : ""}
                </span>
              </>
            }
            onPlay={() => {
              if (!tracks.length) return;
              if (shuffle) {
                const copy = [...tracks];
                for (let i = copy.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1));
                  [copy[i], copy[j]] = [copy[j], copy[i]];
                }
                setQueue(copy, 0, allSongs.id);
              } else {
                setQueue(tracks, 0, allSongs.id);
              }
            }}
            shuffleActive={shuffle}
            onShuffle={toggleShuffle}
          />
          <TrackTable
            tracks={tracks}
            playlistId={allSongs.id}
            isLikedSongs
            onChanged={load}
            onUpgrade={upgrade}
            emptyMessage="Your library is empty."
          />
        </section>
      )}
    </div>
  );
}
