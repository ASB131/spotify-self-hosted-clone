"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useWebSocket } from "@/lib/ws";

type Job = {
  id: number;
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

  const connected = useWebSocket((event) => {
    if (event === "download_progress" || event === "download_complete" || event === "download_failed") {
      load();
    }
  });

  useEffect(() => {
    setLive(connected);
  }, [connected]);

  const active = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const finished = jobs.filter((j) => j.status === "completed" || j.status === "failed");

  async function clearFinished() {
    try {
      await api("/api/v1/downloads/jobs?finished_only=true", { method: "DELETE" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clear failed");
    }
  }

  return (
    <div className="max-w-2xl pb-8">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Downloads</h1>
          <p className="text-xs text-muted mt-0.5">
            {live ? "Live updates on" : "Polling"} · from YouTube extension
          </p>
        </div>
        {finished.length > 0 && (
          <button type="button" onClick={clearFinished} className="text-xs text-muted hover:text-white">
            Clear finished
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      {jobs.length === 0 ? (
        <p className="text-sm text-muted">
          No downloads yet. Use{" "}
          <Link href="/extension/connect" className="text-spotify underline">
            Extension connect
          </Link>{" "}
          and Save on YouTube.
        </p>
      ) : (
        <ul className="space-y-2">
          {[...active, ...finished.slice(0, 12)].map((j) => (
            <li key={j.id} className="bg-panel/60 rounded-md px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium truncate">
                  {j.title || "Untitled"}
                  {j.artist ? <span className="text-muted font-normal"> · {j.artist}</span> : null}
                </p>
                <span className={`text-xs shrink-0 ${statusColor(j.status)}`}>{j.status}</span>
              </div>
              {(j.status === "queued" || j.status === "running") && (
                <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-spotify rounded-full transition-[width]"
                    style={{ width: `${Math.min(100, j.progress || 0)}%` }}
                  />
                </div>
              )}
              <p className="text-[11px] text-muted mt-1 truncate">{j.error || j.stage}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
