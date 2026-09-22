"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CollectionHero, formatTotalDuration } from "@/components/CollectionHero";
import { PlaylistEditModal } from "@/components/PlaylistEditModal";
import { TrackTable } from "@/components/TrackTable";
import { api, type Playlist, type Track } from "@/lib/api";
import { usePlayerStore } from "@/store/player";
import { WebSocketBridge } from "@/lib/ws";

export default function PlaylistPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("You");
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);

  const load = () => {
    if (!Number.isFinite(id)) return;
    Promise.all([
      api<Playlist>(`/api/v1/playlists/${id}`),
      api<Track[]>(`/api/v1/playlists/${id}/tracks`),
      api<{ display_name: string }>("/api/v1/auth/me").catch(() => ({ display_name: "You" })),
    ])
      .then(([p, t, me]) => {
        setPlaylist(p);
        setTracks(t);
        setDisplayName(me.display_name || "You");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load playlist");
      });
  };

  useEffect(() => {
    load();
  }, [id]);

  const totalSec = useMemo(
    () => tracks.reduce((acc, t) => acc + (t.duration_seconds || 0), 0),
    [tracks]
  );

  async function removePlaylist() {
    if (!playlist || playlist.is_liked_songs) return;
    if (!window.confirm(`Delete playlist “${playlist.name}”? Songs stay in your library.`)) return;
    try {
      await api(`/api/v1/playlists/${id}`, { method: "DELETE" });
      router.push("/library");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const arts = tracks.map((t) => t.art_url).filter(Boolean) as string[];

  return (
    <AppShell>
      <WebSocketBridge onRefresh={load} />
      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
      {playlist && (
        <CollectionHero
          kind={playlist.is_liked_songs ? "Playlist" : "Public Playlist"}
          title={playlist.name}
          liked={playlist.is_liked_songs}
          coverUrl={playlist.cover_url}
          artUrls={arts}
          onEditDetails={playlist.is_liked_songs ? undefined : () => setEditing(true)}
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
              setQueue(copy, 0);
            } else {
              setQueue(tracks, 0);
            }
          }}
          shuffleActive={shuffle}
          onShuffle={toggleShuffle}
          actions={
            !playlist.is_liked_songs ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="text-muted hover:text-white p-2"
                  aria-label="More options"
                >
                  <MoreIcon />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 bottom-full mb-1 w-48 rounded-md bg-[#282828] shadow-xl py-1 z-30">
                    <button
                      type="button"
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/10"
                      onClick={() => {
                        setMenuOpen(false);
                        setEditing(true);
                      }}
                    >
                      Edit details
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-white/10"
                      onClick={() => {
                        setMenuOpen(false);
                        removePlaylist();
                      }}
                    >
                      Delete playlist
                    </button>
                  </div>
                )}
              </div>
            ) : null
          }
        />
      )}
      <TrackTable tracks={tracks} onChanged={load} emptyMessage="This playlist is empty. Save tracks to it from the extension." />
      <PlaylistEditModal
        playlist={editing ? playlist : null}
        fallbackArts={arts}
        onClose={() => setEditing(false)}
        onSaved={load}
      />
    </AppShell>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-6 h-6" fill="currentColor" aria-hidden>
      <path d="M3 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" />
    </svg>
  );
}
