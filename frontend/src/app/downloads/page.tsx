"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { useWebSocket } from "@/lib/ws";

type Job = {
  id: number;
  celery_task_id?: string | null;
  url: string;
  title?: string | null;
  artist?: string | null;
  audio_format: string;
  status: string;
  progress: number;
  stage: string;
  error?: string | null;
  track_id?: number | null;
};

function statusColor(status: string) {
  if (status === "completed") return "text-spotify";
  if (status === "failed") return "text-red-400";
  if (status === "running") return "text-amber-300";
  return "text-muted";
}

export default function DownloadsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Job[]>("/api/v1/downloads/jobs")
      .then(setJobs)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load jobs"));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const connected = useWebSocket((event, data) => {
    if (event === "download_progress" || event === "download_complete" || event === "download_failed") {
      load();
    }
  });

  useEffect(() => {
    setLive(connected);
  }, [connected]);

  const active = jobs.filter((j) => j.status === "queued" || j.status === "running");

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-4 mb-2">
        <h1 className="text-2xl font-bold">Downloads</h1>
        <span className={`text-xs ${live ? "text-spotify" : "text-muted"}`}>
          {live ? "Live updates on" : "Polling every 4s"}
        </span>
      </div>
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Progress for YouTube saves (extension or web) and Spotify sync queues. When a job reaches 100%, the track
        appears in <Link href="/library" className="text-spotify underline">Your Library</Link>.
      </p>
      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {active.length > 0 && (
        <p className="text-sm text-amber-200/90 mb-4">{active.length} job(s) in progress</p>
      )}

      {jobs.length === 0 ? (
        <p className="text-muted text-sm">No downloads yet. Save a video from the Chrome extension to see progress here.</p>
      ) : (
        <ul className="space-y-3 max-w-2xl">
          {jobs.map((j) => (
            <li key={j.id} className="bg-panel rounded-lg p-4">
              <div className="flex justify-between gap-3 mb-1">
                <div className="min-w-0">
                  <p className="font-medium truncate">{j.title || j.url}</p>
                  <p className="text-sm text-muted truncate">{j.artist || "—"}</p>
                </div>
                <span className={`text-xs uppercase shrink-0 ${statusColor(j.status)}`}>{j.status}</span>
              </div>
              <p className="text-xs text-muted mb-2">{j.stage}</p>
              <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    j.status === "failed" ? "bg-red-500" : "bg-spotify"
                  }`}
                  style={{ width: `${j.status === "failed" ? 100 : j.progress}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-xs text-muted">
                <span>{j.progress}%</span>
                <span className="uppercase">{j.audio_format}</span>
              </div>
              {j.error && <p className="text-xs text-red-400 mt-2 break-words">{j.error}</p>}
              {j.track_id && (
                <Link href="/library" className="text-xs text-spotify underline mt-2 inline-block">
                  Open in library
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={load} className="mt-6 text-sm text-muted underline">
        Refresh now
      </button>
    </AppShell>
  );
}
