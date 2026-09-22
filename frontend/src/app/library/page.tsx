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

  return (
    <AppShell>
      <WebSocketBridge onRefresh={load} />
      <h2 className="text-2xl font-bold mb-2">Your Library</h2>
      <p className="text-sm text-muted mb-6">
        Use the sidebar to open playlists, filter artists, or create a playlist with +.
      </p>

      <h3 className="text-lg font-semibold mb-3">Playlists</h3>
      <PlaylistGrid playlists={playlists} emptyMessage="No playlists yet — click + in the sidebar." />

      <h3 className="text-lg font-semibold mt-10 mb-3">All songs</h3>
      <TrackTable tracks={tracks} onRemove={remove} onUpgrade={upgrade} emptyMessage="Your library is empty." />
    </AppShell>
  );
}
