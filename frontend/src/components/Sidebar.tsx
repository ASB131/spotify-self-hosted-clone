"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/library", label: "Your Library" },
  { href: "/search", label: "Search" },
  { href: "/profile", label: "Profile" },
  { href: "/setup-guide", label: "Setup guide" },
  { href: "/admin", label: "Admin" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 bg-black/40 p-4 flex flex-col gap-2 shrink-0">
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
    </aside>
  );
}
