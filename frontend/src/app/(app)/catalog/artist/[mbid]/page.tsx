"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

type ArtistPage = {
  mbid: string;
  name: string;
  disambiguation?: string | null;
  tags: string[];
  releases: { id: string; title: string; first_release_date?: string; art_url?: string }[];
};

type ArtistTracks = {
  artist: string;
  mbid: string;
  tracks: {
    title: string;
    artist: string;
    album?: string;
    recording_mbid?: string;
    release_mbid?: string;
    art_url?: string;
  }[];
};

export default function CatalogArtistPage() {
  const params = useParams();
  const mbid = String(params.mbid || "");
  const [page, setPage] = useState<ArtistPage | null>(null);
  const [tracks, setTracks] = useState<ArtistTracks | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!mbid) return;
    api<ArtistPage>(`/api/v1/catalog/artists/${mbid}`).then(setPage).catch(() => setPage(null));
    api<ArtistTracks>(`/api/v1/catalog/artists/${mbid}/tracks`).then(setTracks).catch(() => setTracks(null));
  }, [mbid]);

  async function download(t: ArtistTracks["tracks"][0]) {
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
      setMsg(`Queued via ${res.via}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(null);
    }
  }

  if (!page) {
    return <p className="text-muted text-sm">Loading artist…</p>;
  }

  return (
    <div className="max-w-3xl">
      <Link href="/search" className="text-sm text-muted hover:text-white">
        ← Search
      </Link>
      <h1 className="text-3xl font-bold mt-2 mb-1">{page.name}</h1>
      {page.disambiguation && <p className="text-sm text-muted mb-2">{page.disambiguation}</p>}
      {page.tags.length > 0 && (
        <p className="text-xs text-muted mb-6">{page.tags.slice(0, 8).join(" · ")}</p>
      )}
      {msg && <p className="text-sm text-spotify mb-4">{msg}</p>}

      <h2 className="font-semibold mb-3">Tracks to download</h2>
      {!tracks?.tracks?.length ? (
        <p className="text-sm text-muted">No sample tracks yet.</p>
      ) : (
        <ul className="space-y-2 mb-10">
          {tracks.tracks.map((t, i) => (
            <li
              key={`${t.recording_mbid || t.title}-${i}`}
              className="flex items-center justify-between gap-3 rounded-md bg-black/20 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{t.title}</p>
                <p className="text-xs text-muted truncate">{t.album || t.artist}</p>
              </div>
              <button
                type="button"
                disabled={busy === (t.recording_mbid || t.title)}
                onClick={() => download(t)}
                className="shrink-0 text-xs font-semibold bg-spotify text-black px-3 py-1.5 rounded-full disabled:opacity-50"
              >
                Download
              </button>
            </li>
          ))}
        </ul>
      )}

      <h2 className="font-semibold mb-3">Releases</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {page.releases.map((r) => (
          <li key={r.id} className="rounded-md bg-black/20 px-3 py-2 text-sm">
            <p className="font-medium">{r.title}</p>
            <p className="text-xs text-muted">{r.first_release_date || ""}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
