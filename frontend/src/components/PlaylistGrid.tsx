"use client";

import Link from "next/link";
import { getApiUrl, type Playlist } from "@/lib/api";

type Props = {
  playlists: Playlist[];
  emptyMessage?: string;
};

export function PlaylistGrid({ playlists, emptyMessage }: Props) {
  if (playlists.length === 0) {
    return <p className="text-sm text-muted py-4">{emptyMessage || "No playlists yet."}</p>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {playlists.map((p) => (
        <Link
          key={p.id}
          href={`/playlist/${p.id}`}
          className="group rounded-md p-3 bg-transparent hover:bg-white/10 transition-colors"
        >
          <div
            className={`aspect-square rounded-md mb-3 flex items-center justify-center text-3xl font-bold overflow-hidden shadow-lg ${
              p.is_liked_songs
                ? "bg-gradient-to-br from-[#450af5] to-[#8e8ee5] text-white"
                : "bg-gradient-to-br from-[#333] to-[#1a1a1a] text-muted"
            }`}
          >
            {p.is_liked_songs ? (
              "♪"
            ) : p.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${getApiUrl()}${p.cover_url}`} alt="" className="w-full h-full object-cover" />
            ) : (
              p.name.charAt(0).toUpperCase()
            )}
          </div>
          <p className="font-semibold truncate text-white">{p.name}</p>
          <p className="text-xs text-muted mt-0.5">
            Playlist · {p.track_count} song{p.track_count === 1 ? "" : "s"}
          </p>
        </Link>
      ))}
    </div>
  );
}
