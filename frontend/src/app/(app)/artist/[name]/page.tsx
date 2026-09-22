"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CollectionHero, formatTotalDuration } from "@/components/CollectionHero";
import { PlaylistGrid } from "@/components/PlaylistGrid";
import { TrackTable } from "@/components/TrackTable";
import { api, type Playlist, type Track } from "@/lib/api";
import { usePlayerStore } from "@/store/player";
import { WebSocketBridge } from "@/lib/ws";

type ArtistPageData = {
  name: string;
  tracks: Track[];
  playlists: Playlist[];
  total_duration_seconds: number;
  art_urls: string[];
};

function playContext(tracks: Track[], shuffle: boolean, setQueue: (t: Track[], i?: number) => void) {
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
}

export default function ArtistPage() {
  const params = useParams();
  const router = useRouter();
  const raw = params.name;
  const nameParam = Array.isArray(raw) ? raw.join("/") : String(raw || "");
  const [data, setData] = useState<ArtistPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);

  const load = () => {
    if (!nameParam) return;
    api<ArtistPageData>(`/api/v1/artists/${encodeURIComponent(nameParam)}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load artist"));
  };

  useEffect(() => {
    load();
  }, [nameParam]);

  const totalLabel = useMemo(() => {
    if (!data) return "";
    const n = data.tracks.length;
    return `${n} song${n === 1 ? "" : "s"} · ${formatTotalDuration(data.total_duration_seconds)}`;
  }, [data]);

  return (
    <>
    <WebSocketBridge onRefresh={load} />
      {error && (
        <p className="text-sm text-red-400 mb-4">
          {error}{" "}
          <button type="button" className="underline" onClick={() => router.push("/library")}>
            Back to library
          </button>
        </p>
      )}
      {data && (
        <>
          <CollectionHero
            kind="Artist"
            title={data.name}
            artUrls={data.art_urls}
            subtitle={<span className="text-muted">{totalLabel}</span>}
            onPlay={() => playContext(data.tracks, shuffle, setQueue)}
            shuffleActive={shuffle}
            onShuffle={toggleShuffle}
          />
          <h2 className="text-xl font-bold mb-3">Songs</h2>
          <TrackTable tracks={data.tracks} emptyMessage="No songs for this artist." />
          <h2 className="text-xl font-bold mt-10 mb-3">Appears in playlists</h2>
          <PlaylistGrid playlists={data.playlists} emptyMessage="Not in any playlists yet." />
        </>
      )}
    </>
  );
}
