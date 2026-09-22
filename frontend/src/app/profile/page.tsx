"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { API_URL, api } from "@/lib/api";

type Stats = {
  tracks_count: number;
  playlists_count: number;
  storage_used_bytes: number;
  storage_quota_bytes: number;
};

function formatBytes(n: number) {
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export default function ProfilePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [extMsg, setExtMsg] = useState<string | null>(null);

  useEffect(() => {
    api<Stats>("/api/v1/auth/me/stats").then(setStats);
  }, []);

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
      setExtMsg("Extension downloaded. Follow the steps in the new tab to load it in Chrome.");
    } catch (e) {
      setExtMsg(e instanceof Error ? e.message : "Could not download extension");
    }
  }

  return (
    <AppShell>
      <h2 className="text-2xl font-bold mb-4">Profile</h2>
      {stats && (
        <div className="grid gap-3 max-w-md">
          <Stat label="Tracks" value={String(stats.tracks_count)} />
          <Stat label="Playlists" value={String(stats.playlists_count)} />
          <Stat label="Storage used" value={formatBytes(stats.storage_used_bytes)} />
          <Stat label="Storage quota" value={formatBytes(stats.storage_quota_bytes)} />
        </div>
      )}

      <section className="mt-8 max-w-lg space-y-3">
        <h3 className="font-semibold">Chrome extension</h3>
        <p className="text-sm text-muted">
          Chrome does not allow websites to install extensions automatically. This button downloads the
          extension and opens step-by-step instructions to load it once in Developer mode.
        </p>
        <button
          type="button"
          onClick={installChromeExtension}
          className="bg-spotify text-black px-4 py-2 rounded-full font-semibold"
        >
          Add Chrome extension
        </button>
        {extMsg && <p className="text-sm text-spotify">{extMsg}</p>}
        <Link href="/extension/install" className="text-sm text-muted underline block">
          View install instructions
        </Link>
      </section>

      <a
        href={`${API_URL}/api/v1/spotify/connect`}
        className="inline-block mt-6 bg-white/10 hover:bg-white/15 px-4 py-2 rounded-full font-semibold"
      >
        Connect Spotify for sync
      </a>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel p-4 rounded-md flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
