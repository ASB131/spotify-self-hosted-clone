"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, getApiUrl, type Playlist, type Track } from "@/lib/api";
import { artistHref, splitArtistNames } from "@/lib/artists";

type Filter = "playlists" | "artists";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [filter, setFilter] = useState<Filter>("playlists");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const load = () => {
    Promise.all([api<Playlist[]>("/api/v1/playlists"), api<Track[]>("/api/v1/tracks")])
      .then(([p, t]) => {
        setPlaylists(p);
        setTracks(t);
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
  const visiblePlaylists = playlists.filter((p) => !q || p.name.toLowerCase().includes(q));
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

  return (
    <aside className="w-[280px] shrink-0 flex flex-col rounded-lg bg-panel overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <Link href="/library" className="flex items-center gap-2 text-muted hover:text-white font-bold text-base">
          <LibraryIcon />
          Your Library
        </Link>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="h-8 w-8 rounded-full text-muted hover:text-white hover:bg-white/10 flex items-center justify-center"
          aria-label="Create playlist"
          title="Create playlist"
        >
          <PlusIcon />
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

      <div className="px-3 pb-2">
        <label className="relative block">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
            <MiniSearch />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in Your Library"
            className="w-full bg-transparent hover:bg-white/5 focus:bg-[#242424] rounded-md pl-8 pr-2 py-1.5 text-xs text-white placeholder:text-muted outline-none"
          />
        </label>
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
                  className={`flex items-center gap-3 rounded-md px-2 py-2 ${
                    active ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <span
                    className={`h-12 w-12 rounded shrink-0 flex items-center justify-center text-lg overflow-hidden ${
                      p.is_liked_songs
                        ? "bg-gradient-to-br from-[#450af5] to-[#8e8ee5] text-white"
                        : "bg-[#333] text-muted"
                    }`}
                  >
                    {p.is_liked_songs ? (
                      "♥"
                    ) : p.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`${getApiUrl()}${p.cover_url}`} alt="" className="w-full h-full object-cover" />
                    ) : (
                      p.name.charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className={`block truncate text-sm font-medium ${active ? "text-spotify" : "text-white"}`}>
                      {p.name}
                    </span>
                    <span className="block truncate text-xs text-muted">
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
                  className={`flex items-center gap-3 rounded-md px-2 py-2 ${
                    active ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <span className="h-12 w-12 rounded-full shrink-0 bg-[#333] flex items-center justify-center text-sm font-bold text-muted">
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
    <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor" aria-hidden>
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
