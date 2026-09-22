"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, downloadBlob, type Track } from "@/lib/api";
import { TrackEditModal } from "@/components/TrackEditModal";
import { WebSocketBridge } from "@/lib/ws";
import { refreshAmpersandKeeps } from "@/lib/artists";
import { usePlayerStore } from "@/store/player";

type Stats = {
  tracks_count: number;
  playlists_count: number;
  storage_used_bytes: number;
  storage_quota_bytes: number;
};

type AmpKeep = {
  id: number | null;
  display_name: string;
  normalized_name: string;
  source: string;
  track_count: number;
};

type AmpRules = {
  kept: AmpKeep[];
  candidates: AmpKeep[];
};

function formatBytes(n: number) {
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export default function ProfileContent() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [editing, setEditing] = useState<Track | null>(null);
  const [extMsg, setExtMsg] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [ampRules, setAmpRules] = useState<AmpRules | null>(null);
  const [customKeep, setCustomKeep] = useState("");
  const [ampBusy, setAmpBusy] = useState(false);
  const crossfadeSeconds = usePlayerStore((s) => s.crossfadeSeconds);
  const setCrossfadeSeconds = usePlayerStore((s) => s.setCrossfadeSeconds);

  const loadAmp = () =>
    api<AmpRules>("/api/v1/artists/ampersand-rules")
      .then((r) => {
        setAmpRules(r);
        void refreshAmpersandKeeps();
      })
      .catch(() => setAmpRules(null));

  const load = () => {
    api<Stats>("/api/v1/auth/me/stats").then(setStats);
    api<Track[]>("/api/v1/tracks").then(setTracks).catch(() => setTracks([]));
    loadAmp();
  };

  useEffect(() => {
    load();
  }, []);

  async function installChromeExtension() {
    setExtMsg(null);
    try {
      const blob = await downloadBlob("/api/v1/extension/download");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "media-player-chrome-extension.zip";
      a.click();
      URL.revokeObjectURL(url);
      window.open("/extension/install", "_blank", "noopener,noreferrer");
      setExtMsg("Extension downloaded. Open Extension connect to copy your token.");
    } catch (e) {
      setExtMsg(e instanceof Error ? e.message : "Could not download extension");
    }
  }

  async function keepArtist(name: string) {
    setAmpBusy(true);
    try {
      const res = await api<{ tracks_updated: number }>("/api/v1/artists/ampersand-rules", {
        method: "POST",
        body: JSON.stringify({ display_name: name }),
      });
      setBanner(
        `Kept “${name}” as one artist${res.tracks_updated ? ` · ${res.tracks_updated} tracks updated` : ""}`
      );
      setCustomKeep("");
      await loadAmp();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Could not save artist");
    } finally {
      setAmpBusy(false);
    }
  }

  async function unkeepArtist(id: number) {
    setAmpBusy(true);
    try {
      await api(`/api/v1/artists/ampersand-rules/${id}`, { method: "DELETE" });
      setBanner("Removed keep rule");
      await loadAmp();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Could not remove rule");
    } finally {
      setAmpBusy(false);
    }
  }

  return (
    <>
      <WebSocketBridge onRefresh={load} />
      <h2 className="text-2xl font-bold mb-1">Profile</h2>
      <div className="flex flex-wrap gap-3 text-sm text-muted mb-6">
        <Link href="/setup-guide" className="hover:text-white">
          Setup guide
        </Link>
        <Link href="/stats" className="hover:text-white">
          Listening stats
        </Link>
        <Link href="/history" className="hover:text-white">
          History
        </Link>
      </div>
      {banner && <p className="text-sm text-spotify mb-4">{banner}</p>}

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-2xl mb-8">
          <Stat label="Tracks" value={String(stats.tracks_count)} />
          <Stat label="Playlists" value={String(stats.playlists_count)} />
          <Stat label="Used" value={formatBytes(stats.storage_used_bytes)} />
          <Stat label="Quota" value={formatBytes(stats.storage_quota_bytes)} />
        </div>
      )}

      <section className="max-w-lg space-y-3 mb-8 bg-panel p-4 rounded-lg border border-white/5">
        <h3 className="font-semibold">Playback</h3>
        <p className="text-sm text-muted">
          Crossfade between songs. Set to Off for gapless playback (next track preloads and swaps on end).
        </p>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>Crossfade</span>
          <select
            value={crossfadeSeconds}
            onChange={(e) => setCrossfadeSeconds(Number(e.target.value))}
            className="bg-[#242424] text-white text-sm rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-white"
            aria-label="Crossfade seconds"
          >
            {[0, 1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "Off (gapless)" : `${n} seconds`}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="max-w-lg space-y-3 mb-8 bg-panel p-4 rounded-lg border border-white/5">
        <h3 className="font-semibold">Chrome extension</h3>
        <p className="text-sm text-muted">
          Add music from YouTube. Download, load unpacked, then{" "}
          <Link href="/extension/connect" className="text-spotify underline">
            connect
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={installChromeExtension}
            className="bg-spotify text-black px-4 py-2 rounded-full font-semibold text-sm"
          >
            Download extension
          </button>
          <Link href="/extension/connect" className="bg-white/10 px-4 py-2 rounded-full font-semibold text-sm">
            Connect
          </Link>
        </div>
        {extMsg && <p className="text-sm text-spotify">{extMsg}</p>}
      </section>

      <section className="mb-8 max-w-2xl">
        <h3 className="font-semibold text-lg mb-1">Artists with &amp;</h3>
        <p className="text-sm text-muted mb-4">
          Keep acts like W&amp;W as one artist. Collaborations still split.
        </p>

        {ampRules && ampRules.candidates.length > 0 && (
          <ul className="space-y-2 mb-4">
            {ampRules.candidates.map((c) => (
              <li
                key={c.normalized_name}
                className="flex items-center justify-between gap-3 rounded-md bg-black/20 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{c.display_name}</p>
                  <p className="text-xs text-muted">{c.track_count} tracks</p>
                </div>
                <button
                  type="button"
                  disabled={ampBusy}
                  onClick={() => keepArtist(c.display_name)}
                  className="shrink-0 text-xs font-semibold bg-spotify text-black px-3 py-1.5 rounded-full disabled:opacity-50"
                >
                  Keep as one
                </button>
              </li>
            ))}
          </ul>
        )}

        <ul className="space-y-2 mb-3">
          {(ampRules?.kept || []).map((k) => (
            <li
              key={`${k.source}-${k.normalized_name}`}
              className="flex items-center justify-between gap-3 rounded-md bg-black/20 px-3 py-2"
            >
              <p className="font-medium truncate">{k.display_name}</p>
              {k.source === "user" && k.id != null ? (
                <button
                  type="button"
                  disabled={ampBusy}
                  onClick={() => unkeepArtist(k.id!)}
                  className="text-xs text-muted hover:text-white"
                >
                  Remove
                </button>
              ) : (
                <span className="text-xs text-muted">Built-in</span>
              )}
            </li>
          ))}
        </ul>

        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (customKeep.trim()) void keepArtist(customKeep.trim());
          }}
        >
          <input
            value={customKeep}
            onChange={(e) => setCustomKeep(e.target.value)}
            placeholder="Add keep rule"
            className="flex-1 min-w-[12rem] bg-[#242424] rounded-md px-3 py-2 text-sm outline-none"
          />
          <button type="submit" disabled={ampBusy} className="text-sm text-spotify font-semibold px-3">
            Add
          </button>
        </form>
      </section>

      {tracks.length > 0 && (
        <section className="max-w-2xl">
          <h3 className="font-semibold mb-2">Recent library edits</h3>
          <ul className="text-sm space-y-1">
            {tracks.slice(0, 8).map((t) => (
              <li key={t.id} className="flex justify-between gap-2 py-1 border-b border-white/5">
                <span className="truncate">
                  {t.title} <span className="text-muted">· {t.artist}</span>
                </span>
                <button type="button" className="text-xs text-muted hover:text-white" onClick={() => setEditing(t)}>
                  Edit
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <TrackEditModal track={editing} onClose={() => setEditing(null)} onSaved={load} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel rounded-md p-3 border border-white/5">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-semibold mt-0.5">{value}</p>
    </div>
  );
}
