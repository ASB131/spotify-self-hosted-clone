"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    api<Stats>("/api/v1/auth/me/stats").then(setStats);
  }, []);

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
      <a
        href={`${API_URL}/api/v1/spotify/connect`}
        className="inline-block mt-6 bg-spotify text-black px-4 py-2 rounded-full font-semibold"
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
