"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TrackTable } from "@/components/TrackTable";
import { api, type Track } from "@/lib/api";

type SearchResults = {
  tracks: Track[];
  playlists: { id: number; name: string; is_liked_songs?: boolean; track_count?: number }[];
};

function SearchInner() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [results, setResults] = useState<SearchResults | null>(null);

  async function runSearch(term: string) {
    if (term.length < 2) return;
    const data = await api<SearchResults>(`/api/v1/tracks/search?q=${encodeURIComponent(term)}`);
    setResults(data);
  }

  useEffect(() => {
    const term = params.get("q") || "";
    setQ(term);
    if (term.length >= 2) runSearch(term);
  }, [params]);

  return (
    <>
      <h2 className="text-2xl font-bold mb-4">Search</h2>
      <div className="flex gap-2 mb-6">
        <input
          className="flex-1 bg-[#242424] rounded-full px-4 py-2.5 outline-none focus:ring-2 focus:ring-white"
          placeholder="Tracks, artists, playlists…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch(q.trim())}
        />
        <button
          type="button"
          onClick={() => runSearch(q.trim())}
          className="bg-spotify text-black px-6 rounded-full font-semibold"
        >
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
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="text-muted text-sm">Loading search…</p>}>
        <SearchInner />
      </Suspense>
  );
}
