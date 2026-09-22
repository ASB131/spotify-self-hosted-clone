"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, getApiUrl, type Playlist, type Track } from "@/lib/api";
import { artistHref, splitArtistNames, useAmpersandKeeps } from "@/lib/artists";
import { ContextMenu, type ContextMenuItem } from "@/components/ContextMenu";
import { PlaylistEditModal } from "@/components/PlaylistEditModal";
import { usePlayerStore } from "@/store/player";

type Filter = "playlists" | "artists";

type MenuState = { x: number; y: number; playlist: Playlist } | null;

type StorageStats = {
  storage_used_bytes: number;
  storage_quota_bytes: number;
  media_disk_total_bytes?: number;
  media_disk_used_bytes?: number;
};

function formatGb(n: number) {
  if (!n || !Number.isFinite(n)) return "0 GB";
  const gb = n / 1024 ** 3;
  if (gb < 10) return `${gb.toFixed(1)} GB`;
  return `${Math.round(gb)} GB`;
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  useAmpersandKeeps();
  const pathname = usePathname();
  const router = useRouter();
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [filter, setFilter] = useState<Filter>("playlists");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [menu, setMenu] = useState<MenuState>(null);
  const [editing, setEditing] = useState<Playlist | null>(null);
  const [storage, setStorage] = useState<StorageStats | null>(null);

  const load = () => {
    Promise.all([
      api<Playlist[]>("/api/v1/playlists"),
      api<Track[]>("/api/v1/tracks"),
      api<StorageStats>("/api/v1/auth/me/stats").catch(() => null),
    ])
      .then(([p, t, s]) => {
        setPlaylists(p);
        setTracks(t);
        if (s) setStorage(s);
      })
      .catch(() => {
        setPlaylists([]);
        setTracks([]);
      });
  };

  useEffect(() => {
    load();
  }, [pathname]);

  const artists = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tracks) {
      for (const name of splitArtistNames(t.artist)) {
        const key = name.toLowerCase();
        if (!map.has(key)) map.set(key, name);
      }
    }
    return [...map.values()].sort((a, b) => a.localeCompare(b));
  }, [tracks]);

  const q = query.trim().toLowerCase();
  const visiblePlaylists = playlists
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => {
      const rank = (p: Playlist) => (p.is_liked_songs ? 0 : p.is_liked_playlist ? 1 : 2);
      const d = rank(a) - rank(b);
      if (d !== 0) return d;
      return a.name.localeCompare(b.name);
    });
  const visibleArtists = artists.filter((a) => !q || a.toLowerCase().includes(q));

  async function createPlaylist(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      const pl = await api<Playlist>("/api/v1/playlists", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setNewName("");
      setCreating(false);
      setFilter("playlists");
      load();
      router.push(`/playlist/${pl.id}`);
    } catch {
      /* ignore */
    }
  }

  async function queuePlaylist(pl: Playlist) {
    try {
      const list = await api<Track[]>(`/api/v1/playlists/${pl.id}/tracks`);
      if (list.length) addToQueue(list);
    } catch {
      /* ignore */
    }
  }

  const menuItems: ContextMenuItem[] = menu
    ? [
        {
          id: "queue",
          label: "Add to queue",
          onClick: () => {
            void queuePlaylist(menu.playlist);
          },
        },
        {
          id: "settings",
          label: "Playlist settings",
          disabled: menu.playlist.is_liked_songs || !!menu.playlist.is_liked_playlist,
          onClick: () => setEditing(menu.playlist),
        },
      ]
    : [];

  const usedPct =
    storage && storage.storage_quota_bytes > 0
      ? Math.min(100, (storage.storage_used_bytes / storage.storage_quota_bytes) * 100)
      : 0;

  return (
    <aside className="w-full md:w-[280px] h-full shrink-0 flex flex-col rounded-lg bg-[#121212] overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 pt-4 pb-3">
        <Link
          href="/library"
          onClick={() => onNavigate?.()}
          className="flex items-center gap-2 text-white font-bold text-base hover:text-white"
        >
          <LibraryIcon />
          Your Library
        </Link>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="h-8 px-3 rounded-full bg-white/10 hover:bg-white/15 text-white text-sm font-semibold flex items-center gap-1.5"
          aria-label="Create playlist"
        >
          <PlusIcon />
          Create
        </button>
      </div>

      {creating && (
        <form onSubmit={createPlaylist} className="px-3 pb-2 flex gap-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Playlist name"
            className="flex-1 min-w-0 bg-[#242424] rounded-md px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-white"
          />
          <button type="submit" className="text-xs font-semibold text-spotify px-2">
            Create
          </button>
        </form>
      )}

      <div className="flex gap-2 px-3 pb-3 flex-wrap">
        <FilterPill active={filter === "playlists"} onClick={() => setFilter("playlists")}>
          Playlists
        </FilterPill>
        <FilterPill active={filter === "artists"} onClick={() => setFilter("artists")}>
          Artists
        </FilterPill>
      </div>

      <div className="px-3 pb-2 flex items-center justify-between gap-2">
        <label className="relative flex-1 min-w-0">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted">
            <MiniSearch />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in Your Library"
            className="w-full bg-transparent hover:bg-white/5 focus:bg-[#242424] rounded-md pl-8 pr-2 py-1.5 text-xs text-white placeholder:text-muted outline-none"
          />
        </label>
        <span className="text-xs text-muted shrink-0 flex items-center gap-1 pr-1">
          Recents
          <ListIcon />
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {filter === "playlists" &&
          (visiblePlaylists.length === 0 ? (
            <p className="text-xs text-muted px-2 py-4">No playlists yet.</p>
          ) : (
            visiblePlaylists.map((p) => {
              const href = `/playlist/${p.id}`;
              const active = pathname === href;
              return (
                <Link
                  key={p.id}
                  href={href}
                  onClick={() => onNavigate?.()}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, playlist: p });
                  }}
                  className={`flex items-center gap-3 rounded-md px-2 py-2 ${
                    active ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <span
                    className={`h-12 w-12 rounded shrink-0 flex items-center justify-center text-lg overflow-hidden ${
                      p.is_liked_playlist
                        ? "bg-gradient-to-br from-[#450af5] to-[#c74bef] text-white"
                        : p.is_liked_songs
                          ? "bg-gradient-to-br from-[#450af5] to-[#8e8ee5] text-white"
                          : "bg-[#333] text-muted"
                    }`}
                  >
                    {p.is_liked_playlist ? (
                      "♥"
                    ) : p.is_liked_songs ? (
                      "♪"
                    ) : p.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`${getApiUrl()}${p.cover_url}`} alt="" className="w-full h-full object-cover" />
                    ) : (
                      p.name.charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block truncate text-sm font-medium ${
                        active || p.is_liked_songs || p.is_liked_playlist ? "text-spotify" : "text-white"
                      }`}
                    >
                      {p.name}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {(p.is_liked_songs || p.is_liked_playlist) && <PinIcon />}
                      Playlist · {p.track_count} song{p.track_count === 1 ? "" : "s"}
                    </span>
                  </span>
                </Link>
              );
            })
          ))}

        {filter === "artists" &&
          (visibleArtists.length === 0 ? (
            <p className="text-xs text-muted px-2 py-4">No artists in your library.</p>
          ) : (
            visibleArtists.map((name) => {
              const href = artistHref(name);
              const active = pathname === href || pathname === `/artist/${encodeURIComponent(name)}`;
              return (
                <Link
                  key={name}
                  href={href}
                  onClick={() => onNavigate?.()}
                  className={`flex items-center gap-3 rounded-md px-2 py-2 ${
                    active ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <span className="h-12 w-12 rounded-full shrink-0 bg-[#333] text-muted flex items-center justify-center text-lg font-bold">
                    {name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className={`block truncate text-sm font-medium ${active ? "text-spotify" : "text-white"}`}>
                      {name}
                    </span>
                    <span className="block text-xs text-muted">Artist</span>
                  </span>
                </Link>
              );
            })
          ))}
      </nav>

      {storage && (
        <div className="px-3 pb-3 pt-1 border-t border-white/5 shrink-0">
          <p className="text-[11px] uppercase tracking-wide text-muted mb-1">Your media storage</p>
          <p className="text-sm font-semibold text-white tabular-nums">
            {formatGb(storage.storage_used_bytes)} / {formatGb(storage.storage_quota_bytes)}
          </p>
          <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-spotify/80 rounded-full transition-[width]" style={{ width: `${usedPct}%` }} />
          </div>
          {storage.media_disk_total_bytes && storage.media_disk_total_bytes > 0 ? (
            <p className="text-[10px] text-muted mt-1.5 tabular-nums">
              Media volume {formatGb(storage.media_disk_used_bytes || 0)} /{" "}
              {formatGb(storage.media_disk_total_bytes)} used
            </p>
          ) : null}
        </div>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
      <PlaylistEditModal
        playlist={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          load();
          setEditing(null);
        }}
      />
    </aside>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
        active ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/15"
      }`}
    >
      {children}
    </button>
  );
}

function LibraryIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
      <path d="M3 22a1 1 0 0 1-1-1V3a1 1 0 0 1 2 0v18a1 1 0 0 1-1 1zM15.5 2.134A1 1 0 0 0 14 3v18a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1h-2.5zM8 2.134A1 1 0 0 0 6.5 3v18a1 1 0 0 0 1 1H11a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H8z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor" aria-hidden>
      <path d="M8 1.5a.75.75 0 0 1 .75.75V7.5h5.25a.75.75 0 0 1 0 1.5H8.75v5.25a.75.75 0 0 1-1.5 0V9H2a.75.75 0 0 1 0-1.5h5.25V2.25A.75.75 0 0 1 8 1.5z" />
    </svg>
  );
}

function MiniSearch() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor" aria-hidden>
      <path d="M7 1a6 6 0 1 0 3.76 10.7l3.27 3.27a.75.75 0 1 0 1.06-1.06l-3.27-3.27A6 6 0 0 0 7 1zM2.5 7a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0z" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor" aria-hidden>
      <path d="M1 3.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5zm0 4a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5zm0 4a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5z" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3 h-3 inline-block mr-1 text-spotify align-[-1px]" fill="currentColor" aria-hidden>
      <path d="M8.86 1.5a.75.75 0 0 0-1.72 0l-.4 2.4-2.2.73a.75.75 0 0 0-.3 1.25l1.75 1.75-2.2 4.4 4.4-2.2 1.75 1.75a.75.75 0 0 0 1.25-.3l.73-2.2 2.4-.4a.75.75 0 0 0 0-1.72l-2.4-.4-.73-2.2a.75.75 0 0 0-1.25-.3L8.86 1.5z" />
    </svg>
  );
}
