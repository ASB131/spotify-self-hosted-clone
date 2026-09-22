"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, getApiUrl, type Track } from "@/lib/api";
import { usePlayerStore } from "@/store/player";

type ArtistPage = {
  mbid: string;
  name: string;
  disambiguation?: string | null;
  tags: string[];
  releases: { id: string; title: string; first_release_date?: string; art_url?: string }[];
};

type CatalogTrack = {
  title: string;
  artist: string;
  album?: string;
  recording_mbid?: string;
  release_mbid?: string;
  art_url?: string;
  date?: string;
  duration_ms?: number;
  in_library?: boolean;
};

type LibraryTrack = {
  id: number;
  title: string;
  artist: string;
  album?: string | null;
  duration_seconds?: number | null;
  art_url?: string | null;
  in_library?: boolean;
};

type ArtistTracks = {
  artist: string;
  mbid: string;
  library?: LibraryTrack[];
  tracks: CatalogTrack[];
};

function artSrc(url?: string | null) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${getApiUrl()}${url}`;
}

function fmtDur(sec?: number | null, ms?: number | null) {
  const s = sec ?? (ms != null ? Math.round(ms / 1000) : null);
  if (s == null || Number.isNaN(s)) return "";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function CatalogArtistPage() {
  const params = useParams();
  const mbid = String(params.mbid || "");
  const setQueue = usePlayerStore((s) => s.setQueue);
  const [page, setPage] = useState<ArtistPage | null>(null);
  const [tracks, setTracks] = useState<ArtistTracks | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loadingTracks, setLoadingTracks] = useState(true);

  useEffect(() => {
    if (!mbid) return;
    setLoadingTracks(true);
    api<ArtistPage>(`/api/v1/catalog/artists/${mbid}`).then(setPage).catch(() => setPage(null));
    api<ArtistTracks>(`/api/v1/catalog/artists/${mbid}/tracks`)
      .then(setTracks)
      .catch(() => setTracks(null))
      .finally(() => setLoadingTracks(false));
  }, [mbid]);

  const heroArt = useMemo(() => {
    const fromRelease = page?.releases?.find((r) => r.art_url)?.art_url;
    const fromLib = tracks?.library?.find((t) => t.art_url)?.art_url;
    const fromCat = tracks?.tracks?.find((t) => t.art_url)?.art_url;
    return artSrc(fromRelease || fromLib || fromCat || null);
  }, [page, tracks]);

  async function download(t: CatalogTrack) {
    const id = t.recording_mbid || t.title;
    setBusy(id);
    setMsg(null);
    try {
      const res = await api<{ via: string }>("/api/v1/catalog/download", {
        method: "POST",
        body: JSON.stringify({
          title: t.title,
          artist: t.artist,
          album: t.album,
          recording_mbid: t.recording_mbid,
          release_mbid: t.release_mbid,
        }),
      });
      setMsg(`Queued via ${res.via} — see Downloads`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(null);
    }
  }

  function playLibrary() {
    const lib = tracks?.library || [];
    if (!lib.length) return;
    const asTracks: Track[] = lib.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      duration_seconds: t.duration_seconds,
      format: "flac",
      file_size_bytes: 0,
      art_url: t.art_url,
    }));
    setQueue(asTracks, 0);
  }

  if (!page) {
    return <p className="text-muted text-sm">Loading artist…</p>;
  }

  const library = tracks?.library || [];
  const catalog = tracks?.tracks || [];

  return (
    <div className="pb-10 -mt-2">
      {/* Hero */}
      <div
        className="relative rounded-lg overflow-hidden mb-6 px-6 pt-16 pb-8"
        style={{
          background: heroArt
            ? `linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(18,18,18,0.92) 100%), url(${heroArt}) center/cover`
            : "linear-gradient(180deg, #535353 0%, #181818 70%)",
        }}
      >
        <Link href="/search" className="absolute top-4 left-6 text-sm text-white/70 hover:text-white">
          ← Search
        </Link>
        <div className="flex items-end gap-6">
          <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-full overflow-hidden shadow-2xl bg-black/40 shrink-0 flex items-center justify-center text-5xl font-bold text-white/30">
            {heroArt ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={heroArt} alt="" className="w-full h-full object-cover" />
            ) : (
              page.name.slice(0, 1)
            )}
          </div>
          <div className="min-w-0 pb-1">
            <p className="text-xs font-semibold mb-2">Artist</p>
            <h1 className="text-4xl sm:text-6xl font-black tracking-tight mb-3 break-words">{page.name}</h1>
            {page.disambiguation && <p className="text-sm text-white/70 mb-1">{page.disambiguation}</p>}
            {page.tags.length > 0 && (
              <p className="text-sm text-white/60">{page.tags.slice(0, 6).join(" · ")}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-8 px-1">
        <button
          type="button"
          disabled={!library.length}
          onClick={playLibrary}
          className="w-14 h-14 rounded-full bg-spotify text-black text-2xl flex items-center justify-center disabled:opacity-40 shadow-lg"
          aria-label="Play"
        >
          ▶
        </button>
        {msg && <p className="text-sm text-spotify">{msg}</p>}
      </div>

      {/* In library */}
      <section className="mb-10">
        <h2 className="text-xl font-bold mb-4">In your library</h2>
        {loadingTracks ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : library.length === 0 ? (
          <p className="text-sm text-muted">No downloaded songs for this artist yet.</p>
        ) : (
          <ul>
            {library.map((t, i) => (
              <li
                key={t.id}
                className="grid grid-cols-[2rem_1fr_auto_auto] sm:grid-cols-[2rem_3rem_1fr_auto_4rem] gap-3 items-center px-2 py-2 rounded-md hover:bg-white/10 group"
              >
                <span className="text-muted text-sm text-right">{i + 1}</span>
                <div className="hidden sm:block w-10 h-10 rounded overflow-hidden bg-[#282828]">
                  {artSrc(t.art_url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={artSrc(t.art_url)!} alt="" className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <button
                  type="button"
                  className="text-left min-w-0"
                  onClick={() => {
                    const asTracks: Track[] = library.map((x) => ({
                      id: x.id,
                      title: x.title,
                      artist: x.artist,
                      album: x.album,
                      duration_seconds: x.duration_seconds,
                      format: "flac",
                      file_size_bytes: 0,
                      art_url: x.art_url,
                    }));
                    const idx = asTracks.findIndex((x) => x.id === t.id);
                    setQueue(asTracks, Math.max(0, idx));
                  }}
                >
                  <p className="font-medium truncate group-hover:text-white">{t.title}</p>
                  <p className="text-xs text-muted truncate sm:hidden">{t.album || t.artist}</p>
                </button>
                <span className="w-6 h-6 rounded-full bg-spotify text-black flex items-center justify-center text-xs font-bold">
                  ✓
                </span>
                <span className="text-sm text-muted text-right tabular-nums">
                  {fmtDur(t.duration_seconds)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Download more */}
      <section className="mb-10">
        <h2 className="text-xl font-bold mb-1">More to download</h2>
        <p className="text-sm text-muted mb-4">Latest catalog recordings first.</p>
        {loadingTracks ? (
          <p className="text-sm text-muted">Loading catalog…</p>
        ) : catalog.length === 0 ? (
          <p className="text-sm text-muted">No extra catalog tracks found.</p>
        ) : (
          <ul>
            {catalog.map((t, i) => (
              <li
                key={`${t.recording_mbid || t.title}-${i}`}
                className="grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[2rem_3rem_1fr_auto_auto] gap-3 items-center px-2 py-2 rounded-md hover:bg-white/10"
              >
                <span className="text-muted text-sm text-right">{i + 1}</span>
                <div className="hidden sm:block w-10 h-10 rounded overflow-hidden bg-[#282828]">
                  {artSrc(t.art_url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={artSrc(t.art_url)!} alt="" className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="font-medium truncate">{t.title}</p>
                  <p className="text-xs text-muted truncate">
                    {t.album || t.artist}
                    {t.date ? ` · ${t.date}` : ""}
                  </p>
                </div>
                <span className="text-sm text-muted tabular-nums hidden sm:inline">
                  {fmtDur(null, t.duration_ms)}
                </span>
                <button
                  type="button"
                  disabled={busy === (t.recording_mbid || t.title)}
                  onClick={() => download(t)}
                  className="shrink-0 w-8 h-8 rounded-full border border-white/30 hover:border-white text-lg leading-none flex items-center justify-center disabled:opacity-40"
                  title="Download"
                >
                  {busy === (t.recording_mbid || t.title) ? "…" : "+"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
