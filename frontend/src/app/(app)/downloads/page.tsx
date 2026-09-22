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
  bytes_downloaded?: number | null;
  bytes_total?: number | null;
  speed_bps?: number | null;
};

function statusColor(status: string) {
  if (status === "completed") return "text-spotify";
  if (status === "failed") return "text-red-400";
  if (status === "running") return "text-amber-300";
  return "text-muted";
}

function fmtBytes(n?: number | null) {
  if (n == null || !Number.isFinite(n) || n < 0) return null;
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function etaLabel(job: Job) {
  const down = job.bytes_downloaded;
  const total = job.bytes_total;
  const speed = job.speed_bps;
  if (total && down != null && total > down) {
    const left = total - down;
    if (speed && speed > 0) {
      const sec = Math.round(left / speed);
      if (sec < 60) return `~${sec}s left`;
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      if (m < 60) return `~${m}m ${s}s left`;
      return `~${Math.floor(m / 60)}h ${m % 60}m left`;
    }
    return `${fmtBytes(left)} left`;
  }
  return null;
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
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [load]);

  const connected = useWebSocket((event, data) => {
    if (event === "download_progress" || event === "download_complete" || event === "download_failed") {
      const jobId = data?.job_id as number | undefined;
      if (jobId && event === "download_progress") {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  status: String(data.status || j.status),
                  progress: Number(data.progress ?? j.progress),
                  stage: String(data.stage || j.stage),
                  title: (data.title as string) || j.title,
                  artist: (data.artist as string) || j.artist,
                  error: (data.error as string) || j.error,
                  bytes_downloaded:
                    data.bytes_downloaded != null ? Number(data.bytes_downloaded) : j.bytes_downloaded,
                  bytes_total: data.bytes_total != null ? Number(data.bytes_total) : j.bytes_total,
                  speed_bps: data.speed_bps != null ? Number(data.speed_bps) : j.speed_bps,
                }
              : j
          )
        );
      }
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
            {live ? "Live updates on" : "Updating every few seconds"} · YouTube & extension
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
          No downloads yet. Search YouTube in the app or use{" "}
          <Link href="/extension/connect" className="text-spotify underline">
            Extension connect
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-2">
          {[...active, ...finished.slice(0, 12)].map((j) => {
            const eta = etaLabel(j);
            const downLbl = fmtBytes(j.bytes_downloaded);
            const totalLbl = fmtBytes(j.bytes_total);
            const speedLbl = j.speed_bps ? `${fmtBytes(j.speed_bps)}/s` : null;
            const activeJob = j.status === "queued" || j.status === "running";
            return (
              <li key={j.id} className="bg-panel/60 rounded-md px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium truncate">
                    {j.title || "Untitled"}
                    {j.artist ? <span className="text-muted font-normal"> · {j.artist}</span> : null}
                  </p>
                  <span className="text-[10px] uppercase text-muted shrink-0 tabular-nums">
                    {j.audio_format}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className={`text-xs ${statusColor(j.status)}`}>{j.status}</span>
                  {activeJob && (
                    <span className="text-[11px] text-muted tabular-nums">
                      {j.progress}%
                      {eta ? ` · ${eta}` : ""}
                    </span>
                  )}
                </div>
                {activeJob && (
                  <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-spotify rounded-full transition-[width] duration-300"
                      style={{ width: `${Math.min(100, j.progress || 0)}%` }}
                    />
                  </div>
                )}
                {activeJob && (downLbl || totalLbl || speedLbl) && (
                  <p className="text-[11px] text-muted mt-1 tabular-nums">
                    {downLbl && totalLbl
                      ? `${downLbl} / ${totalLbl}`
                      : downLbl
                        ? `${downLbl} downloaded`
                        : null}
                    {speedLbl ? ` · ${speedLbl}` : ""}
                    {eta && !j.stage?.includes("left") ? ` · ${eta}` : ""}
                  </p>
                )}
                <p className="text-[11px] text-muted mt-1 truncate">{j.error || j.stage}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
