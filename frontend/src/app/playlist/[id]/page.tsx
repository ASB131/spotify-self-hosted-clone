"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { TrackTable } from "@/components/TrackTable";
import { api, type Playlist, type Track } from "@/lib/api";
import { WebSocketBridge } from "@/lib/ws";

export default function PlaylistPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!Number.isFinite(id)) return;
    Promise.all([
      api<Playlist>(`/api/v1/playlists/${id}`),
      api<Track[]>(`/api/v1/playlists/${id}/tracks`),
    ])
      .then(([p, t]) => {
        setPlaylist(p);
        setTracks(t);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load playlist");
      });
  };

  useEffect(() => {
    load();
  }, [id]);

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

  return (
    <AppShell>
      <WebSocketBridge onRefresh={load} />
      <Link href="/library" className="text-sm text-muted hover:text-white mb-4 inline-block">
        ← Back to Library
      </Link>
      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
      {playlist && (
        <div className="flex items-end gap-5 mb-8">
          <div
            className={`w-40 h-40 shrink-0 rounded shadow-2xl flex items-center justify-center text-5xl font-bold ${
              playlist.is_liked_songs
                ? "bg-gradient-to-br from-[#450af5] to-[#8e8ee5]"
                : "bg-gradient-to-br from-[#333] to-[#111]"
            }`}
          >
            {playlist.is_liked_songs ? "♥" : playlist.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 pb-1">
            <p className="text-xs uppercase tracking-wide text-muted mb-1">Playlist</p>
            <h1 className="text-4xl sm:text-5xl font-black truncate mb-2">{playlist.name}</h1>
            <p className="text-sm text-muted">
              {playlist.track_count} song{playlist.track_count === 1 ? "" : "s"}
              {playlist.description ? ` · ${playlist.description}` : ""}
            </p>
            {!playlist.is_liked_songs && (
              <button type="button" onClick={removePlaylist} className="text-xs text-red-400 mt-3 underline">
                Delete playlist
              </button>
            )}
          </div>
        </div>
      )}
      <TrackTable tracks={tracks} emptyMessage="This playlist is empty. Save tracks to it from the extension." />
    </AppShell>
  );
}
