"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

type Rec = {
  recording_mbid: string;
  title: string;
  artist: string;
  artist_mbid?: string | null;
  album?: string | null;
  release_mbid?: string | null;
  duration_ms?: number | null;
  art_url?: string | null;
};

export default function CatalogRecordingPage() {
  const params = useParams();
  const mbid = String(params.mbid || "");
  const [rec, setRec] = useState<Rec | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!mbid) return;
    api<Rec>(`/api/v1/catalog/recordings/${mbid}`).then(setRec).catch(() => setRec(null));
  }, [mbid]);

  async function download() {
    if (!rec) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api<{ via: string }>("/api/v1/catalog/download", {
        method: "POST",
        body: JSON.stringify({
          title: rec.title,
          artist: rec.artist,
          album: rec.album,
          recording_mbid: rec.recording_mbid,
          release_mbid: rec.release_mbid,
        }),
      });
      setMsg(`Queued via ${res.via}. Check Downloads / All Songs shortly.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  if (!rec) {
    return <p className="text-muted text-sm">Loading song…</p>;
  }

  const mins = rec.duration_ms ? Math.round(rec.duration_ms / 1000 / 60) : null;

  return (
    <div className="max-w-xl">
      <Link href="/search" className="text-sm text-muted hover:text-white">
        ← Search
      </Link>
      {rec.art_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={rec.art_url} alt="" className="w-48 h-48 object-cover rounded-md mt-4 mb-4" />
      )}
      <h1 className="text-3xl font-bold mb-1">{rec.title}</h1>
      <p className="text-lg mb-1">
        {rec.artist_mbid ? (
          <Link href={`/catalog/artist/${rec.artist_mbid}`} className="hover:underline text-spotify">
            {rec.artist}
          </Link>
        ) : (
          rec.artist
        )}
      </p>
      {rec.album && <p className="text-sm text-muted mb-4">{rec.album}</p>}
      {mins != null && <p className="text-xs text-muted mb-6">~{mins} min</p>}
      <button
        type="button"
        disabled={busy}
        onClick={download}
        className="bg-spotify text-black px-6 py-2.5 rounded-full font-semibold disabled:opacity-50"
      >
        {busy ? "Queuing…" : "Download"}
      </button>
      {msg && <p className="text-sm text-spotify mt-4">{msg}</p>}
    </div>
  );
}
