"use client";

import { useRef, useState } from "react";
import { artUrl, type Track } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { ArtistLinks } from "@/lib/artists";
import { usePlayerStore } from "@/store/player";

export function QueuePanel() {
  const open = usePlayerStore((s) => s.queuePanelOpen);
  const setOpen = usePlayerStore((s) => s.setQueuePanelOpen);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const playAt = usePlayerStore((s) => s.playAt);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);
  const reorderQueue = usePlayerStore((s) => s.reorderQueue);
  const clearQueue = usePlayerStore((s) => s.clearQueue);
  const clearQueueFully = usePlayerStore((s) => s.clearQueueFully);
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  if (!open) return null;

  const now = queueIndex >= 0 ? queue[queueIndex] : null;
  const upNext = queue.map((t, i) => ({ track: t, index: i })).filter((x) => x.index !== queueIndex);

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= queue.length) return;
    // Skip over now-playing slot visually: reorder relative to full queue
    reorderQueue(index, target);
  }

  return (
    <div className="fixed inset-0 z-[150] flex justify-end" role="dialog" aria-label="Queue">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close queue" onClick={() => setOpen(false)} />
      <aside className="relative w-full max-w-md h-full bg-[#121212] border-l border-white/10 shadow-2xl flex flex-col queue-panel-enter pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-base font-bold">Queue</h2>
          <div className="flex items-center gap-1">
            {queue.length > 1 && (
              <button
                type="button"
                onClick={() => clearQueue()}
                className="text-xs text-muted hover:text-white px-2 py-1.5 min-h-[36px]"
                title="Keep only the current song"
              >
                Clear next
              </button>
            )}
            {queue.length > 0 && (
              <button
                type="button"
                onClick={() => clearQueueFully()}
                className="text-xs text-muted hover:text-white px-2 py-1.5 min-h-[36px]"
              >
                Clear all
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 w-9 rounded-full hover:bg-white/10 text-muted hover:text-white"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {now && (
            <section>
              <h3 className="px-2 text-xs font-bold uppercase tracking-wider text-muted mb-2">Now playing</h3>
              <QueueRow track={now} active onPlay={() => playAt(queueIndex)} />
            </section>
          )}

          <section>
            <h3 className="px-2 text-xs font-bold uppercase tracking-wider text-muted mb-2">
              Next up {upNext.length ? `· ${upNext.length}` : ""}
            </h3>
            {upNext.length === 0 ? (
              <p className="px-2 text-sm text-muted">No songs queued next.</p>
            ) : (
              <ul className="space-y-0.5">
                {upNext.map(({ track, index }) => (
                  <li
                    key={`${track.id}-${index}`}
                    draggable
                    onDragStart={() => {
                      dragFrom.current = index;
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(index);
                    }}
                    onDragLeave={() => setDragOver((v) => (v === index ? null : v))}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = dragFrom.current;
                      dragFrom.current = null;
                      setDragOver(null);
                      if (from == null || from === index) return;
                      reorderQueue(from, index);
                    }}
                    onDragEnd={() => {
                      dragFrom.current = null;
                      setDragOver(null);
                    }}
                    className={`rounded-md ${dragOver === index ? "bg-white/10" : ""}`}
                  >
                    <QueueRow
                      track={track}
                      draggableHint
                      onPlay={() => playAt(index)}
                      onRemove={() => removeFromQueue(index)}
                      onMoveUp={() => move(index, -1)}
                      onMoveDown={() => move(index, 1)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function QueueRow({
  track,
  active,
  draggableHint,
  onPlay,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  track: Track;
  active?: boolean;
  draggableHint?: boolean;
  onPlay: () => void;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const cover = artUrl(track);
  return (
    <div className={`group flex items-center gap-2 rounded-md px-2 py-2 ${active ? "bg-white/5" : "hover:bg-white/5"}`}>
      {draggableHint && (
        <span
          className="text-muted cursor-grab text-xs select-none hidden md:inline px-1"
          title="Drag to reorder"
          aria-hidden
        >
          ⋮⋮
        </span>
      )}
      {draggableHint && (onMoveUp || onMoveDown) && (
        <div className="flex flex-col md:hidden shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            className="h-8 w-8 text-muted hover:text-white text-xs"
            aria-label="Move up"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            className="h-8 w-8 text-muted hover:text-white text-xs"
            aria-label="Move down"
          >
            ▼
          </button>
        </div>
      )}
      <button type="button" onClick={onPlay} className="w-10 h-10 shrink-0 rounded-sm overflow-hidden bg-white/10">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="flex w-full h-full items-center justify-center text-muted text-xs">♪</span>
        )}
      </button>
      <button type="button" onClick={onPlay} className="min-w-0 flex-1 text-left">
        <p className={`truncate text-sm ${active ? "text-spotify" : "text-white"}`}>{track.title}</p>
        <ArtistLinks artist={track.artist} className="block truncate text-xs text-muted" />
      </button>
      <span className="text-xs text-muted tabular-nums shrink-0">{formatDuration(track.duration_seconds)}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-muted hover:text-white p-2 text-sm min-h-[36px] min-w-[36px]"
          aria-label="Remove from queue"
          title="Remove"
        >
          ×
        </button>
      )}
    </div>
  );
}
