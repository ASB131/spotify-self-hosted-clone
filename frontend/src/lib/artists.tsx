"use client";

import Link from "next/link";

/** Split "A, B, C" into clickable artist links. */
export function splitArtistNames(artist: string | null | undefined): string[] {
  if (!artist) return [];
  return artist
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
}

export function artistHref(name: string) {
  return `/artist/${encodeURIComponent(name)}`;
}

type Props = {
  artist: string | null | undefined;
  className?: string;
  linkClassName?: string;
};

export function ArtistLinks({ artist, className = "", linkClassName = "" }: Props) {
  const names = splitArtistNames(artist);
  if (names.length === 0) {
    return <span className={className}>Unknown Artist</span>;
  }
  return (
    <span className={className}>
      {names.map((name, i) => (
        <span key={`${name}-${i}`}>
          {i > 0 && <span className="text-muted">, </span>}
          <Link
            href={artistHref(name)}
            onClick={(e) => e.stopPropagation()}
            className={`hover:underline hover:text-white ${linkClassName}`}
          >
            {name}
          </Link>
        </span>
      ))}
    </span>
  );
}
