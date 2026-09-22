"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { API_URL, api } from "@/lib/api";

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

function formatBytes(n: number) {
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export default function ProfileContent() {
  const searchParams = useSearchParams();
  const [stats, setStats] = useState<Stats | null>(null);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [extMsg, setExtMsg] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("spotify") === "connected") {
      setBanner("Spotify account linked. Liked songs sync runs hourly.");
    }
    api<Stats>("/api/v1/auth/me/stats").then(setStats);
    api<Checklist>("/api/v1/setup/checklist").then(setChecklist);
  }, [searchParams]);

  async function installChromeExtension() {
    setExtMsg(null);
    try {
      const token = sessionStorage.getItem("access_token");
      const res = await fetch(`${API_URL}/api/v1/extension/download`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Download failed");
      }
      const blob = await res.blob();
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

  return (
    <AppShell>
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
          <button type="button" onClick={installChromeExtension} className="bg-spotify text-black px-4 py-2 rounded-full font-semibold text-sm">
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
            href={`${API_URL}/api/v1/spotify/connect`}
            className="inline-block bg-spotify text-black px-4 py-2 rounded-full font-semibold text-sm"
          >
            Connect Spotify
          </a>
        )}
      </section>
    </AppShell>
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
