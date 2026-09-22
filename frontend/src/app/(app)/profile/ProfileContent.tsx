"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, downloadBlob, getOAuthApiUrl, type Track } from "@/lib/api";
import { TrackEditModal } from "@/components/TrackEditModal";
import { WebSocketBridge } from "@/lib/ws";
import { refreshAmpersandKeeps } from "@/lib/artists";

type Stats = {
  tracks_count: number;
  playlists_count: number;
  storage_used_bytes: number;
  storage_quota_bytes: number;
};

type Checklist = {
  spotify_server_configured: boolean;
  spotify_account_linked: boolean;
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
  const searchParams = useSearchParams();
  const [stats, setStats] = useState<Stats | null>(null);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [editing, setEditing] = useState<Track | null>(null);
  const [extMsg, setExtMsg] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [ampRules, setAmpRules] = useState<AmpRules | null>(null);
  const [customKeep, setCustomKeep] = useState("");
  const [ampBusy, setAmpBusy] = useState(false);

  const loadAmp = () =>
    api<AmpRules>("/api/v1/artists/ampersand-rules")
      .then((r) => {
        setAmpRules(r);
        void refreshAmpersandKeeps();
      })
      .catch(() => setAmpRules(null));

  const load = () => {
    api<Stats>("/api/v1/auth/me/stats").then(setStats);
    api<Checklist>("/api/v1/setup/checklist").then(setChecklist);
    api<Track[]>("/api/v1/tracks").then(setTracks).catch(() => setTracks([]));
    loadAmp();
  };

  useEffect(() => {
    if (searchParams.get("spotify") === "connected") {
      setBanner("Spotify account linked. Liked songs sync runs hourly.");
    }
    load();
  }, [searchParams]);

  async function installChromeExtension() {
    setExtMsg(null);
    try {
      const blob = await downloadBlob("/api/v1/extension/download");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "resonance-chrome-extension.zip";
      a.click();
      URL.revokeObjectURL(url);
      window.open("/extension/install", "_blank", "noopener,noreferrer");
      setExtMsg("Extension downloaded. Open Extension connect to copy your token.");
    } catch (e) {
      setExtMsg(e instanceof Error ? e.message : "Could not download extension");
    }
  }

  async function convert(track: Track, format: "mp3" | "flac") {
    try {
      await api(`/api/v1/tracks/${track.id}/convert`, {
        method: "POST",
        body: JSON.stringify({ format }),
      });
      setBanner(`Converting “${track.title}” to ${format.toUpperCase()}…`);
      setTimeout(load, 5000);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Convert failed");
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
      <h2 className="text-2xl font-bold mb-2">Profile</h2>
      <Link href="/setup-guide" className="text-sm text-spotify underline mb-4 inline-block">
        Open full setup guide →
      </Link>
      {banner && <p className="text-sm text-spotify mb-4">{banner}</p>}

      {stats && (
        <div className="grid gap-3 max-w-md mb-8">
          <Stat label="Tracks" value={String(stats.tracks_count)} />
          <Stat label="Playlists" value={String(stats.playlists_count)} />
          <Stat label="Storage used" value={formatBytes(stats.storage_used_bytes)} />
          <Stat label="Storage quota" value={formatBytes(stats.storage_quota_bytes)} />
        </div>
      )}

      <section className="mb-10 max-w-2xl">
        <h3 className="font-semibold text-lg mb-1">Artists with &amp;</h3>
        <p className="text-sm text-muted mb-4">
          Some names are one act (W&amp;W, D-Block &amp; S-te-Fan). Collaborations should split
          (Steve Aoki &amp; Sub Zero Project → two artists). Keep the ones that should stay together.
        </p>

        {ampRules && ampRules.candidates.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs uppercase tracking-wider text-muted mb-2">Suggested — keep as one?</h4>
            <ul className="space-y-2">
              {ampRules.candidates.map((c) => (
                <li
                  key={c.normalized_name}
                  className="flex items-center justify-between gap-3 rounded-md bg-black/20 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.display_name}</p>
                    <p className="text-xs text-muted">
                      {c.track_count} track{c.track_count === 1 ? "" : "s"}
                    </p>
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
          </div>
        )}

        <div className="mb-4">
          <h4 className="text-xs uppercase tracking-wider text-muted mb-2">Kept as one artist</h4>
          <ul className="space-y-2">
            {(ampRules?.kept || []).map((k) => (
              <li
                key={`${k.source}-${k.normalized_name}`}
                className="flex items-center justify-between gap-3 rounded-md bg-black/20 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{k.display_name}</p>
                  <p className="text-xs text-muted">
                    {k.source === "builtin" ? "Built-in" : "Your rule"}
                    {k.track_count ? ` · ${k.track_count} tracks` : ""}
                  </p>
                </div>
                {k.source === "user" && k.id != null ? (
                  <button
                    type="button"
                    disabled={ampBusy}
                    onClick={() => unkeepArtist(k.id!)}
                    className="shrink-0 text-xs text-muted hover:text-white disabled:opacity-50"
                  >
                    Remove
                  </button>
                ) : (
                  <span className="text-xs text-muted shrink-0">Locked</span>
                )}
              </li>
            ))}
            {(!ampRules || ampRules.kept.length === 0) && (
              <li className="text-sm text-muted px-1">No keep rules yet.</li>
            )}
          </ul>
        </div>

        <form
          className="flex flex-wrap gap-2 items-center"
          onSubmit={(e) => {
            e.preventDefault();
            if (customKeep.trim()) void keepArtist(customKeep.trim());
          }}
        >
          <input
            value={customKeep}
            onChange={(e) => setCustomKeep(e.target.value)}
            placeholder="e.g. Showtek & Noisecontrollers"
            className="flex-1 min-w-[12rem] bg-black/30 border border-white/10 rounded-md px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={ampBusy || !customKeep.trim()}
            className="text-sm font-semibold bg-white/10 px-4 py-2 rounded-full disabled:opacity-50"
          >
            Add keep rule
          </button>
        </form>
      </section>

      <section className="mb-10">
        <h3 className="font-semibold text-lg mb-3">Library storage</h3>
        <p className="text-sm text-muted mb-3">Songs on this account, space used, and format conversion.</p>
        <div className="rounded-lg border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-muted text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left font-normal px-3 py-2">Title</th>
                <th className="text-left font-normal px-3 py-2 w-16">Format</th>
                <th className="text-right font-normal px-3 py-2 w-24">Size</th>
                <th className="text-right font-normal px-3 py-2 w-40">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((t) => {
                const fmt = (t.format || "mp3").toLowerCase();
                const other = fmt === "flac" ? "mp3" : "flac";
                return (
                  <tr key={t.id} className="border-t border-white/5 hover:bg-white/[0.04]">
                    <td className="px-3 py-2 min-w-0">
                      <p className="truncate font-medium">{t.title}</p>
                      <p className="truncate text-xs text-muted">{t.artist}</p>
                    </td>
                    <td className="px-3 py-2 uppercase text-xs font-semibold">{fmt}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">
                      {formatBytes(t.file_size_bytes || 0)}
                    </td>
                    <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setEditing(t)}
                        className="text-xs text-muted hover:text-white"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => convert(t, other as "mp3" | "flac")}
                        className="text-xs text-spotify hover:underline"
                      >
                        → {other.toUpperCase()}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {tracks.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-muted text-sm">
                    No songs in your library yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="max-w-lg space-y-3 mb-8 bg-panel p-4 rounded-lg">
        <h3 className="font-semibold">Chrome extension</h3>
        <p className="text-sm text-muted">
          Download the extension, load it in Chrome, then use{" "}
          <Link href="/extension/connect" className="text-spotify underline">
            Extension connect
          </Link>{" "}
          to copy API URL and token (no DevTools needed).
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
            Copy API token
          </Link>
        </div>
        {extMsg && <p className="text-sm text-spotify">{extMsg}</p>}
      </section>

      <section className="max-w-lg space-y-3 bg-panel p-4 rounded-lg">
        <h3 className="font-semibold">Spotify sync</h3>
        {!checklist?.spotify_server_configured ? (
          <p className="text-sm text-muted">
            Spotify API keys are not on the server yet. See{" "}
            <Link href="/setup-guide" className="text-spotify underline">
              Setup guide → Spotify
            </Link>{" "}
            for <code className="text-white">.env</code> steps (admin).
          </p>
        ) : checklist.spotify_account_linked ? (
          <p className="text-sm text-spotify">Your Spotify account is linked.</p>
        ) : (
          <p className="text-sm text-muted">Link your Spotify account to sync liked songs.</p>
        )}
        {checklist?.spotify_server_configured && (
          <a
            href={`${getOAuthApiUrl()}/api/v1/spotify/connect`}
            className="inline-block bg-spotify text-black px-4 py-2 rounded-full font-semibold text-sm"
          >
            Connect Spotify
          </a>
        )}
      </section>

      <TrackEditModal track={editing} onClose={() => setEditing(null)} onSaved={load} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-black/20 p-4 rounded-md flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
