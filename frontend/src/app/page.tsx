"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PlaylistGrid } from "@/components/PlaylistGrid";
import { TrackTable } from "@/components/TrackTable";
import { api, type Playlist, type Track } from "@/lib/api";
import { WebSocketBridge } from "@/lib/ws";
import { fetchSetupStatus } from "@/lib/setup";

export default function HomePage() {
  const router = useRouter();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  const load = () => {
    Promise.all([api<Track[]>("/api/v1/tracks"), api<Playlist[]>("/api/v1/playlists")])
      .then(([t, p]) => {
        setTracks(t);
        setPlaylists(p);
      })
      .catch(() => router.push("/login"));
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
    <AppShell>
      <WebSocketBridge onRefresh={load} />
      <h2 className="text-2xl font-bold mb-4">Playlists</h2>
      <PlaylistGrid playlists={playlists} emptyMessage="Create a playlist from Your Library." />
      <h2 className="text-2xl font-bold mt-10 mb-4">Recently added</h2>
      <TrackTable tracks={tracks.slice(0, 20)} emptyMessage="Save a track from the extension to get started." />
    </AppShell>
  );
}
