"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { TrackTable } from "@/components/TrackTable";
import { api, type Track } from "@/lib/api";

type SearchResults = {
  tracks: Track[];
  playlists: { id: number; name: string; is_liked_songs?: boolean; track_count?: number }[];
};

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);

  async function search() {
    if (q.length < 2) return;
    const data = await api<SearchResults>(`/api/v1/tracks/search?q=${encodeURIComponent(q)}`);
    setResults(data);
  }

  return (
    <AppShell>
      <h2 className="text-2xl font-bold mb-4">Search</h2>
      <div className="flex gap-2 mb-6">
        <input
          className="flex-1 bg-panel rounded-full px-4 py-2"
          placeholder="Tracks, artists, playlists…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <button type="button" onClick={search} className="bg-spotify text-black px-6 rounded-full font-semibold">
          Search
        </button>
      </div>
      {results && (
        <>
          <h3 className="font-semibold mb-2">Tracks</h3>
          <TrackTable tracks={results.tracks} emptyMessage="No matching tracks." />
          <h3 className="font-semibold mt-8 mb-3">Playlists</h3>
          {results.playlists.length === 0 ? (
            <p className="text-sm text-muted">No matching playlists.</p>
          ) : (
            <ul className="space-y-1">
              {results.playlists.map((p) => (
                <li key={p.id}>
                  <Link href={`/playlist/${p.id}`} className="text-left hover:text-spotify hover:underline">
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </AppShell>
  );
}
