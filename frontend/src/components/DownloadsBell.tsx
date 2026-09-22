"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
};

export function DownloadsBell() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [seenIds, setSeenIds] = useState<Set<number>>(() => new Set());
  const menuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api<Job[]>("/api/v1/downloads/jobs")
      .then(setJobs)
      .catch(() => setJobs([]));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  useWebSocket((event) => {
    if (["download_progress", "download_complete", "download_failed", "upgrade_complete"].includes(event)) {
      load();
    }
  });

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const active = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const recent = jobs.slice(0, 8);
  const unreadDone = jobs.filter(
    (j) => (j.status === "completed" || j.status === "failed") && !seenIds.has(j.id)
  );
  const badge = active.length > 0 ? active.length : unreadDone.length > 0 ? unreadDone.length : 0;

  function toggle() {
    setOpen((v) => {
      const next = !v;
      if (next) {
        setSeenIds((prev) => {
          const n = new Set(prev);
          jobs.forEach((j) => {
            if (j.status === "completed" || j.status === "failed") n.add(j.id);
          });
          return n;
        });
      }
      return next;
    });
  }

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        type="button"
        onClick={toggle}
        className="relative h-8 w-8 rounded-full bg-[#242424] text-muted hover:text-white flex items-center justify-center hover:bg-[#2a2a2a]"
        aria-label="Downloads"
        aria-expanded={open}
      >
        <BellIcon />
        {badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-spotify text-black text-[10px] font-bold flex items-center justify-center">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1rem)] rounded-md bg-[#282828] shadow-2xl py-2 text-sm z-50 border border-white/5">
          <div className="flex items-center justify-between px-3 pb-2 border-b border-white/10">
            <p className="font-semibold text-white">Downloads</p>
            <Link href="/downloads" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-white">
              See all
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="px-3 py-4 text-muted text-xs">No downloads yet.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {recent.map((j) => (
                <li key={j.id} className="px-3 py-2.5 border-b border-white/5 last:border-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-white text-sm font-medium">{j.title || "Untitled"}</p>
                    <span
                      className={`text-[10px] uppercase shrink-0 ${
                        j.status === "completed"
                          ? "text-spotify"
                          : j.status === "failed"
                            ? "text-red-400"
                            : "text-amber-300"
                      }`}
                    >
                      {j.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted truncate mt-0.5">
                    {j.artist ? `${j.artist} · ` : ""}
                    {(j.audio_format || "").toUpperCase()}
                    {j.status === "running" || j.status === "queued" ? ` · ${j.progress}%` : ""}
                  </p>
                  {(j.status === "running" || j.status === "queued") && (
                    <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full bg-spotify rounded-full" style={{ width: `${Math.min(100, j.progress)}%` }} />
                    </div>
                  )}
                  {j.status === "failed" && j.error && (
                    <p className="text-[11px] text-red-400/90 mt-1 line-clamp-2">{j.error}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden>
      <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2z" />
    </svg>
  );
}
