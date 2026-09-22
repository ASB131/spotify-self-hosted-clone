"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";

type Me = {
  display_name: string;
  role: string;
};

export function TopBar() {
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
    sessionStorage.removeItem("access_token");
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

  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 px-4 py-3 bg-gradient-to-b from-[#121212] to-[#121212]/80">
      <form
        onSubmit={search}
        className="flex-1 max-w-xl flex items-center bg-[#242424] hover:bg-[#2a2a2a] focus-within:bg-[#2a2a2a] rounded-full h-12 overflow-hidden ring-0 focus-within:ring-2 focus-within:ring-white"
      >
        <Link
          href="/"
          className={`h-12 w-12 shrink-0 flex items-center justify-center ${
            pathname === "/" ? "text-white" : "text-muted hover:text-white"
          }`}
          aria-label="Home"
          onClick={(e) => e.stopPropagation()}
        >
          <HomeIcon />
        </Link>
        <span className="w-px h-6 bg-white/20" />
        <span className="pl-3 text-muted">
          <SearchIcon />
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="What do you want to play?"
          className="flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder:text-muted outline-none"
        />
      </form>

      <div className="relative ml-auto" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="h-8 w-8 rounded-full bg-[#5a5a5a] text-sm font-bold text-white flex items-center justify-center hover:scale-105 transition-transform"
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
