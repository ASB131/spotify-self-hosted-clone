"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TrackTable } from "@/components/TrackTable";
import { api, type Track } from "@/lib/api";

type SearchResults = {
  tracks: Track[];
  playlists: { id: number; name: string; is_liked_songs?: boolean; track_count?: number }[];
};

type CatalogArtist = {
  mbid: string;
  name: string;
  disambiguation?: string | null;
};

type CatalogRecording = {
  recording_mbid: string;
  title: string;
  artist: string;
  artist_mbid?: string | null;
  album?: string | null;
  release_mbid?: string | null;
  duration_ms?: number | null;
  art_url?: string | null;
};

type CatalogSearch = {
  artists: CatalogArtist[];
  recordings: CatalogRecording[];
  listenbrainz_ok: boolean;
  musicbrainz_ok: boolean;
};

function SearchInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") || "");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [catalog, setCatalog] = useState<CatalogSearch | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function runSearch(term: string) {
    if (term.length < 2) return;
    setMsg(null);
    const [lib, cat] = await Promise.all([
      api<SearchResults>(`/api/v1/tracks/search?q=${encodeURIComponent(term)}`),
      api<CatalogSearch>(`/api/v1/catalog/search?q=${encodeURIComponent(term)}`).catch(() => null),
    ]);
    setResults(lib);
    setCatalog(cat);
  }

  useEffect(() => {
    const term = params.get("q") || "";
    setQ(term);
    if (term.length >= 2) void runSearch(term);
  }, [params]);

  async function downloadRecording(r: CatalogRecording) {
    setBusyId(r.recording_mbid);
    setMsg(null);
    try {
      const res = await api<{ via: string; job_id: number }>("/api/v1/catalog/download", {
        method: "POST",
        body: JSON.stringify({
          title: r.title,
          artist: r.artist,
          album: r.album,
          recording_mbid: r.recording_mbid,
          release_mbid: r.release_mbid,
        }),
      });
      setMsg(`Queued via ${res.via}. Track appears in All Songs when ready.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusyId(null);
    }
  }

  function submit() {
    const term = q.trim();
    if (term.length < 2) return;
    router.push(`/search?q=${encodeURIComponent(term)}`);
    void runSearch(term);
  }

  return (
    <>
      <h2 className="text-2xl font-bold mb-4">Search</h2>
      <div className="flex gap-2 mb-2">
        <input
          className="flex-1 bg-[#242424] rounded-full px-4 py-2.5 outline-none focus:ring-2 focus:ring-white"
          placeholder="Library + catalog (artists & songs)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button
          type="button"
          onClick={submit}
          className="bg-spotify text-black px-6 rounded-full font-semibold"
        >
          Search
        </button>
      </div>
      <p className="text-xs text-muted mb-6">
        Your library first, then MusicBrainz catalog (ListenBrainz powers recommendations elsewhere).
        {catalog && (
          <>
            {" "}
            MB {catalog.musicbrainz_ok ? "OK" : "down"} · LB {catalog.listenbrainz_ok ? "OK" : "down"}
          </>
        )}
      </p>
      {msg && <p className="text-sm text-spotify mb-4">{msg}</p>}

      {results && (
        <>
          <h3 className="font-semibold mb-2">In your library</h3>
          <TrackTable tracks={results.tracks} emptyMessage="No matching tracks in your library." />
          <h3 className="font-semibold mt-8 mb-3">Playlists</h3>
          {results.playlists.length === 0 ? (
            <p className="text-sm text-muted">No matching playlists.</p>
          ) : (
            <ul className="space-y-1">
              {results.playlists.map((p) => (
                <li key={p.id}>
                  <Link href={`/playlist/${p.id}`} className="hover:text-spotify hover:underline">
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {catalog && (
        <>
          <h3 className="font-semibold mt-10 mb-3">Catalog artists</h3>
          {catalog.artists.length === 0 ? (
            <p className="text-sm text-muted">No catalog artists.</p>
          ) : (
            <ul className="space-y-2 mb-8">
              {catalog.artists.map((a) => (
                <li key={a.mbid}>
                  <Link
                    href={`/catalog/artist/${a.mbid}`}
                    className="hover:text-spotify hover:underline font-medium"
                  >
                    {a.name}
                  </Link>
                  {a.disambiguation && (
                    <span className="text-xs text-muted ml-2">({a.disambiguation})</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <h3 className="font-semibold mb-3">Catalog songs</h3>
          {catalog.recordings.length === 0 ? (
            <p className="text-sm text-muted">No catalog recordings.</p>
          ) : (
            <ul className="space-y-2">
              {catalog.recordings.map((r) => (
                <li
                  key={r.recording_mbid}
                  className="flex items-center justify-between gap-3 rounded-md bg-black/20 px-3 py-2"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/catalog/recording/${r.recording_mbid}`}
                      className="font-medium hover:underline truncate block"
                    >
                      {r.title}
                    </Link>
                    <p className="text-xs text-muted truncate">
                      {r.artist}
                      {r.album ? ` · ${r.album}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === r.recording_mbid}
                    onClick={() => downloadRecording(r)}
                    className="shrink-0 text-xs font-semibold bg-spotify text-black px-3 py-1.5 rounded-full disabled:opacity-50"
                  >
                    {busyId === r.recording_mbid ? "…" : "Download"}
                  </button>
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
