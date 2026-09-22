"use client";

import { useState } from "react";
import { artUrl, type Track } from "@/lib/api";
import { formatDuration, formatRelativeDate } from "@/lib/format";
import { ArtistLinks } from "@/lib/artists";
import { usePlayerStore } from "@/store/player";
import { TrackEditModal } from "@/components/TrackEditModal";

type Props = {
  tracks: Track[];
  onChanged?: () => void;
  onUpgrade?: (id: number) => void;
  emptyMessage?: string;
  /** @deprecated use settings modal */
  onRemove?: (id: number) => void;
};

export function TrackTable({ tracks, onChanged, onUpgrade, emptyMessage }: Props) {
  const current = usePlayerStore((s) => s.current);
  const playTrackInContext = usePlayerStore((s) => s.playTrackInContext);
  const [editing, setEditing] = useState<Track | null>(null);

  if (tracks.length === 0) {
    return <p className="text-sm text-muted py-8">{emptyMessage || "No songs yet."}</p>;
  }

  return (
    <>
      <div className="w-full">
        <table className="w-full text-sm border-collapse table-fixed">
          <thead className="sticky top-0 z-10 bg-surface/95 backdrop-blur">
            <tr className="text-muted border-b border-white/10 text-xs uppercase tracking-wider">
              <th className="w-12 font-normal text-right pr-4 py-2">#</th>
              <th className="font-normal text-left py-2">Title</th>
              <th className="font-normal text-left py-2 hidden md:table-cell w-36">Date added</th>
              <th className="font-normal text-right py-2 w-24 pr-2" aria-label="Duration">
                <ClockIcon />
              </th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((t, i) => {
              const active = current?.id === t.id;
              const src = artUrl(t);
              return (
                <tr
                  key={t.id}
                  className={`group h-14 border-b border-transparent hover:bg-white/[0.08] ${
                    active ? "" : ""
                  }`}
                >
                  <td className="text-right pr-4 tabular-nums text-muted group-hover:text-white w-12">
                    <span className={active ? "text-spotify" : ""}>{i + 1}</span>
                  </td>
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => playTrackInContext(t, tracks)}
                        className="w-10 h-10 shrink-0 bg-black/40 overflow-hidden rounded-sm"
                        aria-label={`Play ${t.title}`}
                      >
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="flex w-full h-full items-center justify-center text-muted text-xs">♪</span>
                        )}
                      </button>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => playTrackInContext(t, tracks)}
                          className={`block truncate font-normal text-left hover:underline ${
                            active ? "text-spotify" : "text-white"
                          }`}
                        >
                          {t.title}
                        </button>
                        <ArtistLinks artist={t.artist} className="block truncate text-sm text-muted" />
                      </div>
                    </div>
                  </td>
                  <td className="py-2 text-muted hidden md:table-cell text-sm">
                    {formatRelativeDate(t.added_at)}
                  </td>
                  <td className="py-2 text-right text-muted tabular-nums pr-2">
                    <div className="inline-flex items-center justify-end gap-3 min-w-[5.5rem]">
                      <button
                        type="button"
                        onClick={() => setEditing(t)}
                        className="opacity-0 group-hover:opacity-100 text-muted hover:text-white p-1"
                        aria-label="Song options"
                        title="Edit song"
                      >
                        <SettingsIcon />
                      </button>
                      {onUpgrade && t.format === "mp3" && (
                        <button
                          type="button"
                          onClick={() => onUpgrade(t.id)}
                          className="opacity-0 group-hover:opacity-100 text-[10px] uppercase tracking-wide text-spotify"
                        >
                          FLAC
                        </button>
                      )}
                      <span className="w-10 text-right">{formatDuration(t.duration_seconds)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TrackEditModal
        track={editing}
        onClose={() => setEditing(null)}
        onSaved={() => onChanged?.()}
      />
    </>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 inline-block opacity-70" aria-hidden>
      <path
        fill="currentColor"
        d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8.75-3.25v3.5l2.5 1.5-.75 1.25L7.25 9V4.75h1.5z"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor" aria-hidden>
      <path d="M3 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" />
    </svg>
  );
}
