"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CollectionHero, formatTotalDuration } from "@/components/CollectionHero";
import { TrackTable } from "@/components/TrackTable";
import { api, type Track } from "@/lib/api";
import { usePlayerStore } from "@/store/player";
import { WebSocketBridge } from "@/lib/ws";

type AlbumDetail = {
  key: string;
  name: string;
  artist: string;
  track_count: number;
  total_duration_seconds: number;
  art_url?: string | null;
  tracks: Track[];
};

export default function AlbumPage() {
  const params = useParams();
  const key = decodeURIComponent(String(params.key || ""));
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);

  const load = () => {
    if (!key) return;
    api<AlbumDetail>(`/api/v1/albums/${encodeURIComponent(key)}`)
      .then(setAlbum)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load album"));
  };

  useEffect(() => {
    load();
  }, [key]);

  const arts = useMemo(
    () => (album?.tracks || []).map((t) => t.art_url).filter(Boolean) as string[],
    [album]
  );

  return (
    <>
      <WebSocketBridge onRefresh={load} />
      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
      {album && (
        <CollectionHero
          kind="Album"
          title={album.name}
          coverUrl={album.art_url}
          artUrls={arts}
          subtitle={
            <>
              <span className="font-bold text-white">{album.artist}</span>
              <span className="text-white/70">·</span>
              <span className="text-white/70">
                {album.track_count} song{album.track_count === 1 ? "" : "s"}
                {album.total_duration_seconds > 0
                  ? `, ${formatTotalDuration(album.total_duration_seconds)}`
                  : ""}
              </span>
            </>
          }
          onPlay={() => {
            if (!album.tracks.length) return;
            if (shuffle) {
              const copy = [...album.tracks];
              for (let i = copy.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [copy[i], copy[j]] = [copy[j], copy[i]];
              }
              setQueue(copy, 0);
            } else {
              setQueue(album.tracks, 0);
            }
          }}
          shuffleActive={shuffle}
          onShuffle={toggleShuffle}
        />
      )}
      {album && (
        <TrackTable
          tracks={album.tracks}
          onChanged={load}
          emptyMessage="No tracks in this album."
        />
      )}
    </>
  );
}
