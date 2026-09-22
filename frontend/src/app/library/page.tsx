"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { api, type Track } from "@/lib/api";
import { usePlayerStore } from "@/store/player";
import { WebSocketBridge } from "@/lib/ws";

export default function LibraryPage() {
  const router = useRouter();
  const [tracks, setTracks] = useState<Track[]>([]);
  const setTrack = usePlayerStore((s) => s.setTrack);

  const load = () =>
    api<Track[]>("/api/v1/tracks")
      .then(setTracks)
      .catch(() => router.push("/login"));

  useEffect(() => {
    load();
  }, [router]);

  async function remove(id: number) {
    await api(`/api/v1/tracks/${id}`, { method: "DELETE" });
    load();
  }

  async function upgrade(id: number) {
    await api("/api/v1/tracks/upgrade-quality", {
      method: "POST",
      body: JSON.stringify({ track_id: id }),
    });
  }

  return (
    <AppShell>
      <WebSocketBridge onRefresh={load} />
      <h2 className="text-2xl font-bold mb-4">Your Library</h2>
      <ul className="space-y-2">
        {tracks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 p-3 bg-panel rounded-md">
            <button type="button" className="flex-1 text-left" onClick={() => setTrack(t)}>
              {t.title} — <span className="text-muted">{t.artist}</span>
            </button>
            {t.format === "mp3" && (
              <button type="button" onClick={() => upgrade(t.id)} className="text-xs text-spotify border border-spotify px-2 py-1 rounded">
                Upgrade FLAC
              </button>
            )}
            <button type="button" onClick={() => remove(t.id)} className="text-xs text-red-400">
              Delete
            </button>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
