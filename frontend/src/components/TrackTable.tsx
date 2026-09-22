"use client";

import { useEffect, useMemo, useState } from "react";
import { api, artUrl, type Playlist, type Track } from "@/lib/api";
import { formatDuration, formatRelativeDate } from "@/lib/format";
import { ArtistLinks } from "@/lib/artists";
import { usePlayerStore } from "@/store/player";
import { TrackEditModal } from "@/components/TrackEditModal";
import { ContextMenu, type ContextMenuItem } from "@/components/ContextMenu";

type Props = {
  tracks: Track[];
  playlistId?: number;
  isLikedSongs?: boolean;
  onChanged?: () => void;
  onUpgrade?: (id: number) => void;
  emptyMessage?: string;
  /** @deprecated use settings modal */
  onRemove?: (id: number) => void;
};

type MenuState = { x: number; y: number; track: Track } | null;

export function TrackTable({
  tracks,
  playlistId,
  isLikedSongs,
  onChanged,
  onUpgrade,
  emptyMessage,
}: Props) {
  const current = usePlayerStore((s) => s.current);
  const playTrackInContext = usePlayerStore((s) => s.playTrackInContext);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const [editing, setEditing] = useState<Track | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    api<Playlist[]>("/api/v1/playlists")
      .then(setPlaylists)
      .catch(() => setPlaylists([]));
  }, []);

  const addTargets = useMemo(
    () => playlists.filter((p) => !p.is_liked_songs && p.id !== playlistId),
    [playlists, playlistId]
  );

  const canRemoveFromPlaylist = !!playlistId && !isLikedSongs;

  async function addTrackToPlaylist(trackId: number, destId: number) {
    try {
      await api(`/api/v1/playlists/${destId}/tracks`, {
        method: "POST",
        body: JSON.stringify({ track_id: trackId }),
      });
    } catch {
      /* ignore */
    }
  }

  async function removeFromPlaylist(trackId: number) {
    if (!playlistId || isLikedSongs) return;
    try {
      await api(`/api/v1/playlists/${playlistId}/tracks/${trackId}`, { method: "DELETE" });
      onChanged?.();
    } catch {
      /* ignore */
    }
  }

  const menuItems: ContextMenuItem[] = menu
    ? [
        {
          id: "add-playlist",
          label: "Add to playlist",
          submenu:
            addTargets.length > 0
              ? addTargets.map((p) => ({
                  id: `pl-${p.id}`,
                  label: p.name,
                  onClick: () => {
                    void addTrackToPlaylist(menu.track.id, p.id);
                  },
                }))
              : [{ id: "none", label: "No other playlists", onClick: () => undefined, disabled: true }],
        },
        ...(canRemoveFromPlaylist
          ? [
              {
                id: "remove",
                label: "Remove from playlist",
                danger: true,
                onClick: () => {
                  void removeFromPlaylist(menu.track.id);
                },
              } satisfies ContextMenuItem,
            ]
          : []),
        {
          id: "queue",
          label: "Add to queue",
          onClick: () => addToQueue(menu.track),
        },
      ]
    : [];

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
              <th className="font-normal text-left py-2 hidden md:table-cell w-14" aria-label="Source" />
              <th className="font-normal text-left py-2 hidden lg:table-cell w-14" aria-label="Quality" />
              <th className="font-normal text-left py-2 hidden lg:table-cell w-14" aria-label="Added via" />
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
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, track: t });
                  }}
                  className="group h-14 border-b border-transparent hover:bg-white/[0.08]"
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
                  <td className="py-2 hidden md:table-cell w-14 align-middle">
                    <SourceBadge source={t.source} />
                  </td>
                  <td className="py-2 hidden lg:table-cell w-14 align-middle">
                    <FormatBadge format={t.format} />
                  </td>
                  <td className="py-2 hidden lg:table-cell w-14 align-middle">
                    <ViaBadge via={t.added_via} />
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
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
      <TrackEditModal
        track={editing}
        onClose={() => setEditing(null)}
        onSaved={() => onChanged?.()}
      />
    </>
  );
}

function SourceBadge({ source }: { source?: string | null }) {
  const key = (source || "upload").toLowerCase();
  let label = "Other";
  let className = "bg-amber-400/15 text-amber-200/90 border-amber-400/25";
  if (key === "youtube") {
    label = "YT";
    className = "bg-red-400/15 text-red-300/90 border-red-400/25";
  } else if (key === "spotify") {
    label = "SP";
    className = "bg-emerald-400/15 text-emerald-300/90 border-emerald-400/25";
  } else if (key === "upload") {
    label = "Up";
  } else if (key === "lidarr") {
    label = "LD";
    className = "bg-sky-400/15 text-sky-200/90 border-sky-400/25";
  }
  const title =
    key === "youtube"
      ? "YouTube"
      : key === "spotify"
        ? "Spotify"
        : key === "upload"
          ? "Upload"
          : key === "lidarr"
            ? "Lidarr"
            : "Other source";
  return (
    <span
      title={title}
      className={`inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded-[3px] border px-1 text-[10px] font-semibold tracking-wide ${className}`}
    >
      {label}
    </span>
  );
}

function FormatBadge({ format }: { format?: string | null }) {
  const key = (format || "mp3").toLowerCase();
  const isFlac = key === "flac";
  return (
    <span
      title={isFlac ? "FLAC" : "MP3"}
      className={`inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded-[3px] border px-1 text-[10px] font-semibold tracking-wide ${
        isFlac
          ? "bg-violet-400/15 text-violet-200/90 border-violet-400/25"
          : "bg-white/10 text-white/70 border-white/15"
      }`}
    >
      {isFlac ? "FL" : "MP3"}
    </span>
  );
}

function ViaBadge({ via }: { via?: string | null }) {
  const key = (via || "library").toLowerCase();
  let label = "Lib";
  let title = "Library";
  let className = "bg-white/10 text-white/70 border-white/15";
  if (key === "extension") {
    label = "Ext";
    title = "Chrome extension";
    className = "bg-orange-400/15 text-orange-200/90 border-orange-400/25";
  } else if (key === "discover_weekly") {
    label = "DW";
    title = "Discover Weekly";
    className = "bg-rose-400/15 text-rose-200/90 border-rose-400/25";
  } else if (key === "release_radar") {
    label = "RR";
    title = "Release Radar";
    className = "bg-blue-400/15 text-blue-200/90 border-blue-400/25";
  } else if (key === "spotify") {
    label = "Sync";
    title = "Spotify sync";
    className = "bg-emerald-400/15 text-emerald-200/90 border-emerald-400/25";
  } else if (key === "upload") {
    label = "Up";
    title = "Upload";
  }
  return (
    <span
      title={title}
      className={`inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded-[3px] border px-1 text-[10px] font-semibold tracking-wide ${className}`}
    >
      {label}
    </span>
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
