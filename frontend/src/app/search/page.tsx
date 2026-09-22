"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api, type Track } from "@/lib/api";
import { usePlayerStore } from "@/store/player";

type SearchResults = { tracks: Track[]; playlists: { id: number; name: string }[] };

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const setTrack = usePlayerStore((s) => s.setTrack);

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
          <ul className="mb-4 space-y-1">
            {results.tracks.map((t) => (
              <li key={t.id}>
                <button type="button" className="text-left hover:text-spotify" onClick={() => setTrack(t)}>
                  {t.title} — {t.artist}
                </button>
              </li>
            ))}
          </ul>
          <h3 className="font-semibold mb-2">Playlists</h3>
          <ul className="space-y-1">
            {results.playlists.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>
        </>
      )}
    </AppShell>
  );
}
