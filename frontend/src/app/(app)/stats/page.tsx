"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type StatEntry = {
  name: string;
  track_id?: number | null;
  play_count: number;
  minutes: number;
};

type Stats = {
  range: string;
  total_plays: number;
  total_minutes: number;
  top_tracks: StatEntry[];
  top_artists: StatEntry[];
};

const RANGES = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "all", label: "All time" },
] as const;

export default function StatsPage() {
  const [range, setRange] = useState<"7d" | "30d" | "all">("30d");
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(() => {
    api<Stats>(`/api/v1/me/listening-stats?range=${range}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load stats"));
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  async function clearStats() {
    const ok = window.confirm(
      "Clear all listening history and stats? This removes play records used for recently played, history, and these charts."
    );
    if (!ok) return;
    setClearing(true);
    setError(null);
    try {
      await api("/api/v1/me/listening-stats", { method: "DELETE" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear stats");
    } finally {
      setClearing(false);
    }
  }

  const maxTrack = Math.max(1, ...(data?.top_tracks.map((t) => t.play_count) || [1]));
  const maxArtist = Math.max(1, ...(data?.top_artists.map((t) => t.play_count) || [1]));

  return (
    <div className="max-w-3xl space-y-8 pb-10 min-w-0">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Listening stats</h1>
          <p className="text-sm text-muted mt-1">
            <Link href="/history" className="hover:underline">
              View full history
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                  range === r.id ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/15"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={clearing}
            onClick={() => void clearStats()}
            className="px-3 py-1.5 rounded-full text-sm text-red-400 bg-white/5 hover:bg-white/10 disabled:opacity-40"
          >
            Clear stats
          </button>
        </div>
      </header>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {!data ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-panel border border-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Plays</p>
              <p className="text-3xl font-black tabular-nums mt-1">{data.total_plays.toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-panel border border-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Minutes</p>
              <p className="text-3xl font-black tabular-nums mt-1">{data.total_minutes.toLocaleString()}</p>
            </div>
          </div>

          <section>
            <h2 className="text-xl font-bold mb-3">Top tracks</h2>
            {data.top_tracks.length === 0 ? (
              <p className="text-sm text-muted">No data yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.top_tracks.map((t) => (
                  <li key={`${t.track_id}-${t.name}`}>
                    <div className="flex justify-between text-sm mb-1 gap-2">
                      <span className="truncate">{t.name}</span>
                      <span className="text-muted tabular-nums shrink-0">
                        {t.play_count} · {t.minutes}m
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-spotify/80 rounded-full"
                        style={{ width: `${(t.play_count / maxTrack) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">Top artists</h2>
            {data.top_artists.length === 0 ? (
              <p className="text-sm text-muted">No data yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.top_artists.map((a) => (
                  <li key={a.name}>
                    <div className="flex justify-between text-sm mb-1 gap-2">
                      <span className="truncate">{a.name}</span>
                      <span className="text-muted tabular-nums shrink-0">
                        {a.play_count} · {a.minutes}m
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-spotify/80 rounded-full"
                        style={{ width: `${(a.play_count / maxArtist) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
