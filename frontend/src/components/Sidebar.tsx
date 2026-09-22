"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api, type Playlist } from "@/lib/api";

const links = [
  { href: "/", label: "Home" },
  { href: "/library", label: "Your Library" },
  { href: "/downloads", label: "Downloads" },
  { href: "/search", label: "Search" },
  { href: "/profile", label: "Profile" },
  { href: "/setup-guide", label: "Setup guide" },
  { href: "/admin", label: "Admin" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    api<Playlist[]>("/api/v1/playlists")
      .then(setPlaylists)
      .catch(() => setPlaylists([]));
  }, [pathname]);

  return (
    <aside className="w-60 bg-black/40 p-4 flex flex-col gap-2 shrink-0 overflow-y-auto">
      <h1 className="text-xl font-bold text-spotify mb-4 px-2">Resonance</h1>
      <nav className="flex flex-col gap-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`px-3 py-2 rounded-md text-sm font-medium ${
              pathname === l.href ? "bg-white/10 text-white" : "text-muted hover:text-white"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      {playlists.length > 0 && (
        <>
          <div className="border-t border-white/10 my-3" />
          <p className="px-3 text-xs uppercase tracking-wider text-muted mb-1">Playlists</p>
          <nav className="flex flex-col gap-0.5">
            {playlists.map((p) => (
              <Link
                key={p.id}
                href={`/playlist/${p.id}`}
                className={`px-3 py-1.5 rounded-md text-sm truncate ${
                  pathname === `/playlist/${p.id}` ? "bg-white/10 text-white" : "text-muted hover:text-white"
                }`}
              >
                {p.name}
              </Link>
            ))}
          </nav>
        </>
      )}
    </aside>
  );
}
