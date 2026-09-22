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
  isLikedPlaylist?: boolean;
  onChanged?: () => void;
  onUpgrade?: (id: number) => void;
  emptyMessage?: string;
  onRemove?: (id: number) => void;
};

type MenuState = { x: number; y: number; track: Track } | null;
type SortKey = "index" | "title" | "artist" | "added" | "duration" | "format";
type SortDir = "asc" | "desc";

export function TrackTable({
  tracks,
  playlistId,
  isLikedSongs,
  isLikedPlaylist,
  onChanged,
  onUpgrade,
  emptyMessage,
}: Props) {
  const current = usePlayerStore((s) => s.current);
  const playTrackInContext = usePlayerStore((s) => s.playTrackInContext);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const playNext = usePlayerStore((s) => s.playNext);
  const [editing, setEditing] = useState<Track | null>(null);
  const [bulkEdit, setBulkEdit] = useState(false);
  const [menu, setMenu] = useState<MenuState>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("added");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkAlbum, setBulkAlbum] = useState("");
  const [bulkArtist, setBulkArtist] = useState("");
  const [localTracks, setLocalTracks] = useState(tracks);

  useEffect(() => {
    setLocalTracks(tracks);
    setSelected(new Set());
  }, [tracks]);

  useEffect(() => {
    api<Playlist[]>("/api/v1/playlists")
      .then(setPlaylists)
      .catch(() => setPlaylists([]));
  }, []);

  const addTargets = useMemo(
    () => playlists.filter((p) => !p.is_liked_songs && !p.is_liked_playlist && p.id !== playlistId),
    [playlists, playlistId]
  );

  const canRemoveFromPlaylist = !!playlistId && !isLikedSongs && !isLikedPlaylist;

  const sorted = useMemo(() => {
    const copy = [...localTracks];
    const mul = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      if (sortKey === "index") {
        const ia = localTracks.indexOf(a);
        const ib = localTracks.indexOf(b);
        return (ia - ib) * mul;
      }
      if (sortKey === "title") {
        return a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) * mul;
      }
      if (sortKey === "artist") {
        return (a.artist || "").localeCompare(b.artist || "", undefined, { sensitivity: "base" }) * mul;
      }
      if (sortKey === "format") {
        return (a.format || "").localeCompare(b.format || "", undefined, { sensitivity: "base" }) * mul;
      }
      if (sortKey === "added") {
        const ta = a.added_at ? new Date(a.added_at).getTime() : 0;
        const tb = b.added_at ? new Date(b.added_at).getTime() : 0;
        return (ta - tb) * mul;
      }
      const da = a.duration_seconds ?? 0;
      const db = b.duration_seconds ?? 0;
      return (da - db) * mul;
    });
    return copy;
  }, [localTracks, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "added" || key === "duration" ? "desc" : "asc");
    }
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === sorted.length) setSelected(new Set());
    else setSelected(new Set(sorted.map((t) => t.id)));
  }

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
    if (!playlistId || isLikedSongs || isLikedPlaylist) return;
    try {
      await api(`/api/v1/playlists/${playlistId}/tracks/${trackId}`, { method: "DELETE" });
      onChanged?.();
    } catch {
      /* ignore */
    }
  }

  async function applyBulk() {
    const ids = [...selected];
    if (!ids.length) return;
    const body: { track_ids: number[]; album?: string; artist?: string } = { track_ids: ids };
    if (bulkAlbum.trim()) body.album = bulkAlbum.trim();
    if (bulkArtist.trim()) body.artist = bulkArtist.trim();
    if (!body.album && !body.artist) return;
    try {
      await api("/api/v1/tracks/bulk", { method: "PATCH", body: JSON.stringify(body) });
      setBulkEdit(false);
      setBulkAlbum("");
      setBulkArtist("");
      setSelected(new Set());
      onChanged?.();
    } catch {
      /* ignore */
    }
  }

  const menuItems: ContextMenuItem[] = menu
    ? [
        {
          id: "play-next",
          label: "Play next",
          onClick: () => playNext(menu.track),
        },
        {
          id: "queue",
          label: "Add to queue",
          onClick: () => addToQueue(menu.track),
        },
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
      ]
    : [];

  if (localTracks.length === 0) {
    return <p className="text-sm text-muted py-8">{emptyMessage || "No songs yet."}</p>;
  }

  return (
    <>
      {selected.size > 0 && (
        <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-md bg-[#282828] px-3 py-2 text-sm">
          <span className="text-muted">{selected.size} selected</span>
          <button
            type="button"
            className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/15"
            onClick={() => playNext(sorted.filter((t) => selected.has(t.id)))}
          >
            Play next
          </button>
          <button
            type="button"
            className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/15"
            onClick={() => addToQueue(sorted.filter((t) => selected.has(t.id)))}
          >
            Add to queue
          </button>
          <button
            type="button"
            className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/15"
            onClick={() => setBulkEdit(true)}
          >
            Edit metadata
          </button>
          <button type="button" className="text-muted hover:text-white ml-auto" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {bulkEdit && (
        <div className="mb-4 rounded-md border border-white/10 p-4 space-y-3 bg-[#181818]">
          <p className="text-sm font-semibold">Bulk edit ({selected.size} songs)</p>
          <label className="block text-xs text-muted">
            Album
            <input
              value={bulkAlbum}
              onChange={(e) => setBulkAlbum(e.target.value)}
              className="mt-1 w-full bg-[#242424] rounded-md px-3 py-2 text-sm text-white outline-none"
              placeholder="Leave blank to keep"
            />
          </label>
          <label className="block text-xs text-muted">
            Artist
            <input
              value={bulkArtist}
              onChange={(e) => setBulkArtist(e.target.value)}
              className="mt-1 w-full bg-[#242424] rounded-md px-3 py-2 text-sm text-white outline-none"
              placeholder="Leave blank to keep"
            />
          </label>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setBulkEdit(false)} className="text-sm text-muted px-3 py-1.5">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void applyBulk()}
              className="text-sm font-bold bg-spotify text-black rounded-full px-4 py-1.5"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      <div className="w-full min-w-0 overflow-x-auto">
        <table className="w-full text-sm border-collapse table-fixed min-w-[480px]">
          <thead className="sticky top-0 z-10 bg-surface/95 backdrop-blur">
            <tr className="text-muted border-b border-white/10 text-xs uppercase tracking-wider">
              <th className="w-12 py-2 text-right pr-3">
                <span className="inline-flex items-center justify-end w-8">
                  <input
                    type="checkbox"
                    checked={selected.size > 0 && selected.size === sorted.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all"
                    className={`accent-spotify h-3.5 w-3.5 ${
                      selected.size > 0 ? "opacity-100" : "opacity-0 hover:opacity-100 focus:opacity-100"
                    }`}
                  />
                </span>
              </th>
              <SortTh active={sortKey === "title"} dir={sortDir} onClick={() => toggleSort("title")} className="text-left">
                Title
              </SortTh>
              <SortTh
                active={sortKey === "format"}
                dir={sortDir}
                onClick={() => toggleSort("format")}
                className="text-left hidden sm:table-cell w-20"
              >
                Quality
              </SortTh>
              <SortTh
                active={sortKey === "added"}
                dir={sortDir}
                onClick={() => toggleSort("added")}
                className="text-left hidden md:table-cell w-32"
              >
                Date added
              </SortTh>
              <SortTh
                active={sortKey === "duration"}
                dir={sortDir}
                onClick={() => toggleSort("duration")}
                className="text-right w-24 pr-4"
                ariaLabel="Duration"
              >
                <ClockIcon />
              </SortTh>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => {
              const active = current?.id === t.id;
              const src = artUrl(t);
              const isSelected = selected.has(t.id);
              return (
                <tr
                  key={t.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, track: t });
                  }}
                  className="group h-14 border-b border-transparent hover:bg-white/[0.08]"
                >
                  <td className="text-right pr-3 tabular-nums text-muted w-12">
                    <span className="inline-flex items-center justify-end w-8 relative h-4">
                      <span
                        className={`absolute inset-0 flex items-center justify-end ${
                          isSelected ? "opacity-0" : "group-hover:opacity-0"
                        } ${active ? "text-spotify" : ""}`}
                      >
                        {i + 1}
                      </span>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(t.id)}
                        aria-label={`Select ${t.title}`}
                        className={`accent-spotify h-3.5 w-3.5 relative z-10 ${
                          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
                        }`}
                      />
                    </span>
                  </td>
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => playTrackInContext(t, sorted, playlistId)}
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
                          onClick={() => playTrackInContext(t, sorted, playlistId)}
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
                  <td className="py-2 text-muted hidden sm:table-cell text-sm uppercase tracking-wide">
                    {(t.format || "—").toUpperCase()}
                  </td>
                  <td className="py-2 text-muted hidden md:table-cell text-sm">
                    {formatRelativeDate(t.added_at)}
                  </td>
                  <td className="py-2 text-right text-muted pr-4">
                    <div className="inline-flex items-center justify-end gap-1">
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
                      <span className="font-mono tabular-nums text-sm w-[4.5ch] text-right inline-block">
                        {formatDuration(t.duration_seconds)}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
      <TrackEditModal track={editing} onClose={() => setEditing(null)} onSaved={() => onChanged?.()} />
    </>
  );
}

function SortTh({
  children,
  active,
  dir,
  onClick,
  className = "",
  ariaLabel,
}: {
  children: React.ReactNode;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <th className={`font-normal py-2 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={`inline-flex items-center gap-1 hover:text-white transition-colors ${
          active ? "text-white" : "text-muted"
        }`}
      >
        {children}
        {active && <span className="text-[10px] opacity-80">{dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
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
