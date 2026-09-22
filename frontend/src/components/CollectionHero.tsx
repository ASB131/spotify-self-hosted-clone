"use client";

import type { ReactNode } from "react";
import { getApiUrl } from "@/lib/api";

type Props = {
  kind: "Playlist" | "Artist" | "Public Playlist";
  title: string;
  subtitle?: ReactNode;
  /** Absolute or /api/... art URLs (up to 4 for collage) */
  artUrls?: (string | null | undefined)[];
  coverUrl?: string | null;
  gradient?: string;
  liked?: boolean;
  onPlay?: () => void;
  shuffleActive?: boolean;
  onShuffle?: () => void;
  actions?: ReactNode;
  /** Click title / cover to edit */
  onEditDetails?: () => void;
};

function resolveArt(url: string) {
  if (url.startsWith("http")) return url;
  return `${getApiUrl()}${url}`;
}

export function CollectionHero({
  kind,
  title,
  subtitle,
  artUrls = [],
  coverUrl,
  gradient,
  liked,
  onPlay,
  shuffleActive,
  onShuffle,
  actions,
  onEditDetails,
}: Props) {
  const arts = artUrls.filter(Boolean).map((u) => resolveArt(u as string)).slice(0, 4);
  const customCover = coverUrl ? resolveArt(coverUrl) : null;
  const bg =
    gradient ||
    (liked
      ? "linear-gradient(180deg, #5038a0 0%, #2a1a5e 45%, #121212 100%)"
      : kind === "Artist"
        ? "linear-gradient(180deg, #535353 0%, #282828 40%, #121212 100%)"
        : "linear-gradient(180deg, #4a3728 0%, #2a1f18 40%, #121212 100%)");

  const Cover = (
    <div
      className={`w-48 h-48 sm:w-56 sm:h-56 shrink-0 shadow-[0_8px_40px_rgba(0,0,0,0.55)] overflow-hidden bg-black/40 ${
        liked || kind === "Artist" ? "rounded-full sm:rounded" : "rounded"
      } ${liked ? "!rounded" : ""} ${onEditDetails && !liked ? "cursor-pointer hover:brightness-110" : ""}`}
      onClick={liked ? undefined : onEditDetails}
      onKeyDown={
        onEditDetails && !liked
          ? (e) => {
              if (e.key === "Enter") onEditDetails();
            }
          : undefined
      }
      role={onEditDetails && !liked ? "button" : undefined}
      tabIndex={onEditDetails && !liked ? 0 : undefined}
    >
      {liked ? (
        <div className="w-full h-full bg-gradient-to-br from-[#450af5] to-[#8e8ee5] flex items-center justify-center text-white text-7xl">
          ♪
        </div>
      ) : customCover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={customCover} alt="" className="w-full h-full object-cover" />
      ) : arts.length >= 4 ? (
        <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
          {arts.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" className="w-full h-full object-cover" />
          ))}
        </div>
      ) : arts[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={arts[0]} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-5xl font-black text-muted bg-gradient-to-br from-[#333] to-[#111]">
          {title.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );

  return (
    <section className="relative -mx-6 mb-2 overflow-hidden">
      <div className="px-6 pt-4 pb-8" style={{ background: bg }}>
        <div className="flex flex-col sm:flex-row items-end gap-6">
          {Cover}
          <div className="min-w-0 pb-1 flex-1">
            <p className="text-sm font-bold mb-2">{kind}</p>
            {onEditDetails && !liked ? (
              <button
                type="button"
                onClick={onEditDetails}
                className="text-left text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight mb-4 break-words hover:underline decoration-2 underline-offset-4"
              >
                {title}
              </button>
            ) : (
              <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight mb-4 break-words">{title}</h1>
            )}
            {subtitle && (
              <div className="text-sm text-white flex flex-wrap items-center gap-x-1.5 gap-y-1">{subtitle}</div>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 py-5 flex items-center gap-5 bg-gradient-to-b from-black/40 to-transparent">
        {onPlay && (
          <button
            type="button"
            onClick={onPlay}
            className="h-14 w-14 rounded-full bg-spotify text-black flex items-center justify-center hover:scale-105 transition-transform shadow-lg"
            aria-label="Play"
          >
            <svg viewBox="0 0 24 24" className="w-7 h-7 ml-0.5" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        )}
        {onShuffle && (
          <button
            type="button"
            onClick={onShuffle}
            className={`p-2 ${shuffleActive ? "text-spotify" : "text-muted hover:text-white"}`}
            aria-label="Shuffle"
            aria-pressed={shuffleActive}
          >
            <ShuffleIcon />
          </button>
        )}
        <div className="flex-1" />
        {actions}
      </div>
    </section>
  );
}

function ShuffleIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-5 h-5" fill="currentColor" aria-hidden>
      <path d="M13.151.922a.75.75 0 1 0-1.06 1.06L13.109 3H11.16a3.75 3.75 0 0 0-2.873 1.34l-6.173 7.356A2.25 2.25 0 0 1 .39 12.25H0V13.5h.391a3.75 3.75 0 0 0 2.873-1.34l6.173-7.356A2.25 2.25 0 0 1 11.16 4.5h1.949l-1.018.982a.75.75 0 1 0 1.06 1.06l2.5-2.414.04-.04a.751.751 0 0 0-.042-1.06z" />
      <path d="M.391 3.75H0V2.5h.391c1.109 0 2.16.49 2.873 1.34L4.89 5.277l-.979 1.167-1.646-1.96A2.25 2.25 0 0 0 .39 3.75zm14.608 8H16v1.5h-.391a3.75 3.75 0 0 1-2.873-1.34l-1.626-1.934.979-1.167 1.646 1.96A2.25 2.25 0 0 0 15.609 11.75h.39z" />
    </svg>
  );
}

export function formatTotalDuration(seconds: number): string {
  if (!seconds || seconds < 0) return "0 sec";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h >= 24) return `over ${h} hr`;
  if (h > 0) return `about ${h} hr`;
  if (m > 0) return `${m} min ${s} sec`;
  return `${s} sec`;
}
