"use client";

import { artUrl, type Track } from "@/lib/api";
import { formatDuration, formatRelativeDate } from "@/lib/format";
import { ArtistLinks } from "@/lib/artists";
import { usePlayerStore } from "@/store/player";

type Props = {
  tracks: Track[];
  onRemove?: (id: number) => void;
  onUpgrade?: (id: number) => void;
  emptyMessage?: string;
};

export function TrackTable({ tracks, onRemove, onUpgrade, emptyMessage }: Props) {
  const current = usePlayerStore((s) => s.current);
  const playTrackInContext = usePlayerStore((s) => s.playTrackInContext);

  if (tracks.length === 0) {
    return <p className="text-sm text-muted py-8">{emptyMessage || "No songs yet."}</p>;
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-muted border-b border-white/10 text-xs uppercase tracking-wider">
            <th className="w-10 font-normal text-right pr-3 py-2">#</th>
            <th className="font-normal text-left py-2">Title</th>
            <th className="font-normal text-left py-2 hidden sm:table-cell w-40">Date added</th>
            <th className="font-normal text-right py-2 w-14" aria-label="Duration">
              <ClockIcon />
            </th>
            {(onRemove || onUpgrade) && <th className="w-28 py-2" />}
          </tr>
        </thead>
        <tbody>
          {tracks.map((t, i) => {
            const active = current?.id === t.id;
            const src = artUrl(t);
            return (
              <tr
                key={t.id}
                className={`group border-b border-transparent hover:bg-white/[0.08] ${
                  active ? "text-spotify" : "text-white"
                }`}
              >
                <td className="text-right pr-3 py-2 tabular-nums text-muted group-hover:text-white">
                  <span className={active ? "text-spotify" : ""}>{i + 1}</span>
                </td>
                <td className="py-2">
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
                        className={`block truncate font-medium text-left hover:underline ${
                          active ? "text-spotify" : "text-white"
                        }`}
                      >
                        {t.title}
                      </button>
                      <ArtistLinks artist={t.artist} className="block truncate text-xs text-muted" />
                    </div>
                  </div>
                </td>
                <td className="py-2 text-muted hidden sm:table-cell">{formatRelativeDate(t.added_at)}</td>
                <td className="py-2 text-right text-muted tabular-nums">
                  {formatDuration(t.duration_seconds)}
                </td>
                {(onRemove || onUpgrade) && (
                  <td className="py-2 text-right">
                    <span className="inline-flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {onUpgrade && t.format === "mp3" && (
                        <button
                          type="button"
                          onClick={() => onUpgrade(t.id)}
                          className="text-xs text-spotify border border-spotify/60 px-2 py-0.5 rounded"
                        >
                          FLAC
                        </button>
                      )}
                      {onRemove && (
                        <button type="button" onClick={() => onRemove(t.id)} className="text-xs text-red-400">
                          Remove
                        </button>
                      )}
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
