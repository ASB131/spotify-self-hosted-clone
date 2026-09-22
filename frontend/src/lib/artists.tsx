"use client";

import Link from "next/link";
import { useEffect } from "react";
import { api } from "@/lib/api";

/**
 * Split multi-artist credits.
 * - Split on: comma, feat/ft/featuring, vs, spaced X/×
 * - Split on & when it is the only separator ("Steve Aoki & Sub Zero Project")
 * - Keep & after X/feat/comma ("D-Block & S-te-Fan X Phuture Noize")
 * - Keep short acts (W&W) and user/builtin keep names
 */
const BUILTIN_AMPERSAND = new Set(["d-block & s-te-fan", "d-block and s-te-fan", "w&w", "w & w"]);

let keepCache = new Set<string>(BUILTIN_AMPERSAND);
let keepLoaded = false;

export function getAmpersandKeeps(): Set<string> {
  return keepCache;
}

export async function refreshAmpersandKeeps(): Promise<Set<string>> {
  try {
    const data = await api<{
      kept: { normalized_name: string }[];
      candidates: { normalized_name: string }[];
    }>("/api/v1/artists/ampersand-rules");
    const next = new Set(BUILTIN_AMPERSAND);
    for (const k of data.kept) next.add(k.normalized_name);
    keepCache = next;
    keepLoaded = true;
  } catch {
    /* offline / logged out — builtins only */
  }
  return keepCache;
}

/** Load keep list once for the app shell (Sidebar, ArtistLinks). */
export function useAmpersandKeeps() {
  useEffect(() => {
    if (!keepLoaded) void refreshAmpersandKeeps();
  }, []);
}

function norm(s: string) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function isShortAmpAct(parts: string[]) {
  if (parts.length !== 2) return false;
  return parts.every((p) => p.replace(/[^0-9A-Za-z]/g, "").length <= 2);
}

export function splitArtistNames(artist: string | null | undefined): string[] {
  if (!artist) return [];
  const text = artist.replace(/[‐‑–—]/g, "-").trim();
  if (!text) return [];

  const keep = keepCache;
  if (keep.has(norm(text))) return [text];

  const primary = text
    .split(/\s*,\s*|\s+(?:feat\.|ft\.|featuring|vs\.?)\s+|\s+[x×]\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks = primary.length ? primary : [text];
  const primarySplit = chunks.length > 1;

  const out: string[] = [];
  for (const chunk of chunks) {
    if (keep.has(norm(chunk)) || !/[&＆]/.test(chunk)) {
      out.push(chunk);
      continue;
    }
    if (primarySplit) {
      out.push(chunk);
      continue;
    }
    const ampParts = chunk
      .split(/\s*[&＆]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (isShortAmpAct(ampParts)) {
      out.push(chunk);
      continue;
    }
    const merged: string[] = [];
    let i = 0;
    while (i < ampParts.length) {
      if (i + 1 < ampParts.length) {
        const duo = `${ampParts[i]} & ${ampParts[i + 1]}`;
        if (keep.has(norm(duo)) || isShortAmpAct([ampParts[i], ampParts[i + 1]])) {
          merged.push(keep.has(norm(duo)) ? duo : `${ampParts[i]}&${ampParts[i + 1]}`);
          i += 2;
          continue;
        }
      }
      merged.push(ampParts[i]);
      i += 1;
    }
    out.push(...merged);
  }
  return out;
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
