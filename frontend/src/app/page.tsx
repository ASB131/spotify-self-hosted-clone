"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { api, type Track } from "@/lib/api";
import { usePlayerStore } from "@/store/player";
import { WebSocketBridge } from "@/lib/ws";

import { fetchSetupStatus } from "@/lib/setup";

export default function HomePage() {
  const router = useRouter();
  const [tracks, setTracks] = useState<Track[]>([]);
  const setTrack = usePlayerStore((s) => s.setTrack);

  const load = () => {
    api<Track[]>("/api/v1/tracks")
      .then(setTracks)
      .catch(() => router.push("/login"));
  };

  useEffect(() => {
    fetchSetupStatus()
      .then((s) => {
        if (s.needs_setup) {
          router.replace("/setup");
          return;
        }
        load();
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  return (
    <AppShell>
      <WebSocketBridge onRefresh={load} />
      <h2 className="text-2xl font-bold mb-4">Recently added</h2>
      <div className="grid gap-2">
        {tracks.slice(0, 12).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTrack(t)}
            className="flex items-center justify-between p-3 rounded-md bg-panel hover:bg-panel-hover text-left"
          >
            <span>
              {t.title} <span className="text-muted">— {t.artist}</span>
            </span>
            <span className="text-xs uppercase text-muted">{t.format}</span>
          </button>
        ))}
      </div>
    </AppShell>
  );
}
