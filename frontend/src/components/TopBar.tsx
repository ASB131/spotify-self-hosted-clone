"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { clearStoredToken } from "@/lib/auth";
import { DownloadsBell } from "@/components/DownloadsBell";

type Me = {
  display_name: string;
  role: string;
};

export function TopBar({ onOpenLibrary }: { onOpenLibrary?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<Me>("/api/v1/auth/me")
      .then(setMe)
      .catch(() => setMe(null));
  }, [pathname]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function logout() {
    try {
      await api("/api/v1/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    clearStoredToken();
    router.push("/login");
  }

  function search(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term.length < 2) {
      router.push("/search");
      return;
    }
    router.push(`/search?q=${encodeURIComponent(term)}`);
  }

  const initial = (me?.display_name || "U").charAt(0).toUpperCase();
  const homeActive = pathname === "/";

  return (
    <header className="shrink-0 h-14 sm:h-16 flex items-center gap-2 sm:gap-3 px-2 sm:px-4 bg-black z-30">
      {onOpenLibrary && (
        <button
          type="button"
          onClick={onOpenLibrary}
          className="md:hidden h-10 w-10 shrink-0 rounded-full bg-[#242424] text-white flex items-center justify-center"
          aria-label="Open library"
        >
          <LibraryMiniIcon />
        </button>
      )}
      <Link href="/" className="shrink-0 flex items-center" aria-label="Mix player home">
        <Image src="/logo.png" alt="Mix player" width={36} height={36} className="rounded-full" priority />
      </Link>

      <div className="flex-1 flex items-center justify-center gap-2 min-w-0 max-w-2xl mx-auto">
        <Link
          href="/"
          className={`h-12 w-12 shrink-0 rounded-full flex items-center justify-center transition-colors ${
            homeActive ? "bg-[#282828] text-white" : "bg-[#242424] text-muted hover:text-white hover:bg-[#2a2a2a]"
          }`}
          aria-label="Home"
        >
          <HomeIcon />
        </Link>
        <form
          onSubmit={search}
          className="flex-1 min-w-0 flex items-center bg-[#242424] hover:bg-[#2a2a2a] focus-within:bg-[#2a2a2a] rounded-full h-12 overflow-hidden focus-within:ring-2 focus-within:ring-white"
        >
          <span className="pl-4 text-white shrink-0">
            <SearchIcon />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="What do you want to play?"
            className="flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder:text-muted outline-none min-w-0"
          />
          <Link
            href="/library"
            className="pr-4 text-muted hover:text-white shrink-0"
            aria-label="Your Library"
            title="Your Library"
          >
            <LibraryMiniIcon />
          </Link>
        </form>
      </div>

      <div className="shrink-0 flex items-center gap-2">
        <DownloadsBell />
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="h-8 w-8 rounded-full bg-[#5a5a5a] text-sm font-bold text-white flex items-center justify-center hover:scale-105 transition-transform ring-2 ring-transparent hover:ring-white/20"
            aria-label="Account menu"
            aria-expanded={open}
          >
            {initial}
          </button>
          {open && (
            <div className="absolute right-0 mt-2 w-56 rounded-md bg-[#282828] shadow-2xl py-1 text-sm z-50 border border-white/5">
              <MenuLink href="/profile" onClick={() => setOpen(false)}>
                Account
              </MenuLink>
              <MenuLink href="/stats" onClick={() => setOpen(false)}>
                Listening stats
              </MenuLink>
              <MenuLink href="/history" onClick={() => setOpen(false)}>
                Listening history
              </MenuLink>
              <MenuLink href="/downloads" onClick={() => setOpen(false)}>
                Downloads
              </MenuLink>
              <MenuLink href="/setup-guide" onClick={() => setOpen(false)}>
                Setup guide
              </MenuLink>
              <MenuLink href="/extension/connect" onClick={() => setOpen(false)}>
                Extension connect
              </MenuLink>
              {me?.role === "admin" && (
                <MenuLink href="/admin" onClick={() => setOpen(false)}>
                  Admin
                </MenuLink>
              )}
              <div className="border-t border-white/10 my-1" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-white/10 text-white"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link href={href} onClick={onClick} className="block px-4 py-2.5 hover:bg-white/10 text-white">
      {children}
    </Link>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>
      <path d="M13.5 1.515a3 3 0 0 0-3 0L3 5.845a2 2 0 0 0-1 1.732V21a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-6h4v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7.577a2 2 0 0 0-1-1.732l-7.5-4.33z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
      <path d="M10.533 1.279a7.933 7.933 0 0 1 7.932 7.932c0 1.977-.725 3.79-1.926 5.186l4.355 4.354a1 1 0 0 1-1.415 1.415l-4.354-4.355a7.904 7.904 0 0 1-5.186 1.926 7.933 7.933 0 0 1 0-15.866zm0 1.999a5.933 5.933 0 1 0 0 11.866 5.933 5.933 0 0 0 0-11.866z" />
    </svg>
  );
}

function LibraryMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
      <path d="M14.5 2.134a1 1 0 0 1 1 0l6 3.464a1 1 0 0 1 .5.866V21a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V3a1 1 0 0 1 .5-.866zM3 4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4z" />
    </svg>
  );
}
