"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PlaylistGrid } from "@/components/PlaylistGrid";
import { TrackTable } from "@/components/TrackTable";
import { api, type Playlist, type Track } from "@/lib/api";
import { WebSocketBridge } from "@/lib/ws";

export default function LibraryPage() {
  const router = useRouter();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    Promise.all([api<Track[]>("/api/v1/tracks"), api<Playlist[]>("/api/v1/playlists")])
      .then(([t, p]) => {
        setTracks(t);
        setPlaylists(p);
      })
      .catch(() => router.push("/login"));

  useEffect(() => {
    load();
  }, [router]);

  async function remove(id: number) {
    await api(`/api/v1/tracks/${id}`, { method: "DELETE" });
    load();
  }

  async function upgrade(id: number) {
    await api("/api/v1/tracks/upgrade-quality", {
      method: "POST",
      body: JSON.stringify({ track_id: id }),
    });
  }

  async function createPlaylist(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      const pl = await api<Playlist>("/api/v1/playlists", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setNewName("");
      setCreating(false);
      router.push(`/playlist/${pl.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create playlist");
    }
  }

  return (
    <AppShell>
      <WebSocketBridge onRefresh={load} />
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <h2 className="text-2xl font-bold">Your Library</h2>
        {!creating ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="bg-white text-black text-sm font-semibold px-4 py-2 rounded-full hover:scale-105 transition-transform"
          >
            Create playlist
          </button>
        ) : (
          <form onSubmit={createPlaylist} className="flex items-center gap-2">
            <input
              autoFocus
              className="bg-panel border border-white/10 rounded-full px-4 py-2 text-sm min-w-[12rem]"
              placeholder="Playlist name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" className="bg-spotify text-black text-sm font-semibold px-4 py-2 rounded-full">
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setNewName("");
              }}
              className="text-sm text-muted"
            >
              Cancel
            </button>
          </form>
        )}
      </div>
      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      <h3 className="text-lg font-semibold mb-3">Playlists</h3>
      <PlaylistGrid playlists={playlists} emptyMessage="No playlists yet — create one above." />

      <h3 className="text-lg font-semibold mt-10 mb-3">All songs</h3>
      <TrackTable tracks={tracks} onRemove={remove} onUpgrade={upgrade} emptyMessage="Your library is empty." />
    </AppShell>
  );
}
