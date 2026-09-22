"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, getApiUrl, type Track } from "@/lib/api";
import { usePlayerStore } from "@/store/player";

type SearchResults = {
  tracks: Track[];
  playlists: {
    id: number;
    name: string;
    is_liked_songs?: boolean;
    track_count?: number;
    cover_url?: string | null;
  }[];
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
};

type Tab = "all" | "playlists" | "songs" | "artists";

function artSrc(url?: string | null) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${getApiUrl()}${url}`;
}

function LetterAvatar({
  label,
  round,
  size = "md",
}: {
  label: string;
  round?: boolean;
  size?: "md" | "lg";
}) {
  const letter = (label || "?").trim().charAt(0).toUpperCase() || "?";
  const box = size === "lg" ? "w-28 h-28 text-5xl" : "w-12 h-12 text-lg";
  return (
    <div
      className={`shrink-0 overflow-hidden bg-[#282828] flex items-center justify-center font-bold text-white/50 ${box} ${
        round ? "rounded-full" : "rounded"
      }`}
    >
      {letter}
    </div>
  );
}

function ArtThumb({
  url,
  round,
  label,
}: {
  url?: string | null;
  round?: boolean;
  label?: string;
}) {
  // Prefer library/local art only — skip broken external CAA for list rows when missing
  const src = artSrc(url);
  if (!src || src.includes("coverartarchive.org")) {
    return <LetterAvatar label={label || ""} round={round} />;
  }
  return (
    <div
      className={`shrink-0 w-12 h-12 overflow-hidden bg-[#282828] ${
        round ? "rounded-full" : "rounded"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="w-full h-full object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    </div>
  );
}

function SearchInner() {
  const params = useSearchParams();
  const playTrackInContext = usePlayerStore((s) => s.playTrackInContext);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [catalog, setCatalog] = useState<CatalogSearch | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [loading, setLoading] = useState(false);
  const q = (params.get("q") || "").trim();

  useEffect(() => {
    if (q.length < 2) {
      setResults(null);
      setCatalog(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setMsg(null);
    Promise.all([
      api<SearchResults>(`/api/v1/tracks/search?q=${encodeURIComponent(q)}`),
      api<CatalogSearch>(`/api/v1/catalog/search?q=${encodeURIComponent(q)}`).catch(() => null),
    ])
      .then(([lib, cat]) => {
        if (cancelled) return;
        setResults(lib);
        setCatalog(cat);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  async function downloadRecording(r: CatalogRecording) {
    setBusyId(r.recording_mbid);
    setMsg(null);
    try {
      const res = await api<{ via: string }>("/api/v1/catalog/download", {
        method: "POST",
        body: JSON.stringify({
          title: r.title,
          artist: r.artist,
          album: r.album,
          recording_mbid: r.recording_mbid,
          release_mbid: r.release_mbid,
        }),
      });
      setMsg(`Queued via ${res.via}. Check Downloads for progress.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusyId(null);
    }
  }

  const topArtist = catalog?.artists?.[0];
  const chips: { id: Tab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "songs", label: "Songs" },
    { id: "artists", label: "Artists" },
    { id: "playlists", label: "Playlists" },
  ];
  const show = (section: Tab) => tab === "all" || tab === section;

  if (q.length < 2) {
    return <p className="text-sm text-muted">Search from the bar above.</p>;
  }

  return (
    <div className="pb-8">
      {(results || catalog) && (
        <div className="flex flex-wrap gap-2 mb-6">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setTab(c.id)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition ${
                tab === c.id ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/15"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-sm text-muted mb-4">Searching…</p>}
      {msg && <p className="text-sm text-spotify mb-4">{msg}</p>}

      {show("artists") && topArtist && (
        <section className="mb-8 flex items-center gap-5 rounded-lg bg-gradient-to-r from-[#3a3a3a] to-[#181818] p-5">
          <LetterAvatar label={topArtist.name} round size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted mb-1">Artist</p>
            <Link
              href={`/catalog/artist/${topArtist.mbid}`}
              className="text-3xl sm:text-4xl font-bold hover:underline truncate block"
            >
              {topArtist.name}
            </Link>
            {topArtist.disambiguation && (
              <p className="text-sm text-muted mt-1">{topArtist.disambiguation}</p>
            )}
          </div>
          <Link
            href={`/catalog/artist/${topArtist.mbid}`}
            className="hidden sm:inline-flex bg-spotify text-black font-bold w-12 h-12 rounded-full items-center justify-center text-xl shrink-0"
            aria-label="Open artist"
          >
            ▶
          </Link>
        </section>
      )}

      {show("playlists") && results && (
        <section className="mb-8">
          <h3 className="text-xl font-bold mb-3">Playlists</h3>
          {results.playlists.length === 0 ? (
            <p className="text-sm text-muted">No matching playlists.</p>
          ) : (
            <ul className="space-y-1">
              {results.playlists.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/playlist/${p.id}`}
                    className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-white/10 group"
                  >
                    <ArtThumb url={p.cover_url} label={p.name} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate group-hover:underline">{p.name}</p>
                      <p className="text-xs text-muted">
                        Playlist
                        {typeof p.track_count === "number" ? ` · ${p.track_count} songs` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-muted">Playlist</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {show("artists") && catalog && catalog.artists.length > 1 && (
        <section className="mb-8">
          <h3 className="text-xl font-bold mb-3">Artists</h3>
          <ul className="space-y-1">
            {catalog.artists.slice(1).map((a) => (
              <li key={a.mbid}>
                <Link
                  href={`/catalog/artist/${a.mbid}`}
                  className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-white/10"
                >
                  <LetterAvatar label={a.name} round />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{a.name}</p>
                    <p className="text-xs text-muted">
                      Artist
                      {a.disambiguation ? ` · ${a.disambiguation}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-muted">Artist</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {show("songs") && (
        <section className="mb-8">
          <h3 className="text-xl font-bold mb-3">Songs</h3>
          <ul className="space-y-1">
            {(results?.tracks || []).map((t) => (
              <li key={`lib-${t.id}`}>
                <button
                  type="button"
                  onClick={() => playTrackInContext(t, results!.tracks)}
                  className="w-full flex items-center gap-3 rounded-md px-2 py-2 hover:bg-white/10 text-left"
                >
                  <ArtThumb url={t.art_url} label={t.title} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{t.title}</p>
                    <p className="text-xs text-muted truncate">Song · {t.artist}</p>
                  </div>
                  <span className="text-xs text-muted mr-2">Song</span>
                  <span className="w-6 h-6 rounded-full bg-spotify text-black flex items-center justify-center text-xs font-bold">
                    ✓
                  </span>
                </button>
              </li>
            ))}
            {(catalog?.recordings || []).map((r) => (
              <li key={r.recording_mbid}>
                <div className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-white/10">
                  <LetterAvatar label={r.title} />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/catalog/recording/${r.recording_mbid}`}
                      className="font-medium truncate block hover:underline"
                    >
                      {r.title}
                    </Link>
                    <p className="text-xs text-muted truncate">
                      Song · {r.artist}
                      {r.album ? ` · ${r.album}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-muted hidden sm:inline">Song</span>
                  <button
                    type="button"
                    disabled={busyId === r.recording_mbid}
                    onClick={() => downloadRecording(r)}
                    className="shrink-0 w-8 h-8 rounded-full border border-white/30 text-white/80 hover:border-white hover:text-white flex items-center justify-center text-lg leading-none disabled:opacity-40"
                    title="Download"
                  >
                    {busyId === r.recording_mbid ? "…" : "+"}
                  </button>
                </div>
              </li>
            ))}
            {!loading && !(results?.tracks?.length || catalog?.recordings?.length) && (
              <p className="text-sm text-muted px-2">No songs found.</p>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="text-muted text-sm">Loading search…</p>}>
      <SearchInner />
    </Suspense>
  );
}
