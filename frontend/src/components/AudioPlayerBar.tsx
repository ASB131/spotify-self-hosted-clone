"use client";

import { useEffect, useRef } from "react";
import { usePlayerStore } from "@/store/player";
import { getSharedAudio } from "@/lib/playerAudio";
import { artUrl } from "@/lib/api";
import { ArtistLinks } from "@/lib/artists";

function fmt(sec: number) {
  if (!sec || !Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioPlayerBar() {
  const {
    current,
    isPlaying,
    volume,
    progress,
    duration,
    shuffle,
    repeat,
    toggle,
    next,
    prev,
    toggleShuffle,
    cycleRepeat,
    setVolume,
    setProgress,
    setDuration,
    seek,
    bindAudio,
    onEnded,
    hydrate,
    persist,
  } = usePlayerStore();

  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const audio = getSharedAudio();
    if (!audio) return;
    bindAudio(audio);
    hydrate();

    const onTime = () => {
      setProgress(audio.currentTime);
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => persist(), 1500);
    };
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnd = () => onEnded();
    const onPlay = () => usePlayerStore.setState({ isPlaying: true });
    const onPause = () => usePlayerStore.setState({ isPlaying: false });

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    const onUnload = () => persist();
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") persist();
    });

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      window.removeEventListener("beforeunload", onUnload);
      if (persistTimer.current) clearTimeout(persistTimer.current);
      // Do NOT pause or destroy shared audio — navigation must keep playing
    };
  }, [bindAudio, hydrate, persist, setDuration, setProgress, onEnded]);

  if (!current) {
    return (
      <footer className="h-[72px] rounded-lg bg-panel px-4 flex items-center text-muted text-sm shrink-0 player-bar">
        Select a track to play
      </footer>
    );
  }

  const cover = artUrl(current);
  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <footer className="h-[90px] rounded-lg bg-panel px-3 grid grid-cols-[1fr_minmax(280px,40%)_1fr] items-center gap-3 shrink-0 player-bar">
      <div className="flex items-center gap-3 min-w-0">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-14 w-14 rounded-sm object-cover shrink-0 transition-transform duration-300 hover:scale-[1.02]" />
        ) : (
          <div className="h-14 w-14 rounded-sm bg-white/10 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{current.title}</p>
          <ArtistLinks artist={current.artist} className="truncate text-xs text-muted block" linkClassName="text-muted" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-1.5 min-w-0">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={toggleShuffle}
            className={`transition-colors ${shuffle ? "text-spotify" : "text-muted hover:text-white"}`}
            aria-label="Shuffle"
            aria-pressed={shuffle}
          >
            <IconShuffle />
          </button>
          <button type="button" onClick={prev} className="text-muted hover:text-white transition-colors" aria-label="Previous">
            <IconPrev />
          </button>
          <button
            type="button"
            onClick={toggle}
            className="h-8 w-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <IconPause /> : <IconPlay />}
          </button>
          <button type="button" onClick={next} className="text-muted hover:text-white transition-colors" aria-label="Next">
            <IconNext />
          </button>
          <button
            type="button"
            onClick={cycleRepeat}
            className={`relative transition-colors ${repeat !== "off" ? "text-spotify" : "text-muted hover:text-white"}`}
            aria-label="Repeat"
          >
            <IconRepeat />
            {repeat === "one" && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-bold">1</span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-2 w-full text-[11px] text-muted tabular-nums">
          <span className="w-10 text-right">{fmt(progress)}</span>
          <div className="relative flex-1 h-3 flex items-center group">
            <div className="absolute inset-x-0 h-1 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full bg-white group-hover:bg-spotify transition-[width] duration-75 ease-linear"
                style={{ width: `${pct}%` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={progress}
              onChange={(e) => seek(Number(e.target.value))}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
              aria-label="Seek"
            />
          </div>
          <span className="w-10">{fmt(duration)}</span>
        </div>
      </div>

      <div className="flex justify-end items-center gap-2 min-w-0">
        <IconVolume />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-24 accent-white"
          aria-label="Volume"
        />
      </div>
    </footer>
  );
}

function IconPlay() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 ml-0.5" fill="currentColor">
      <path d="M3 2.5v11l10-5.5z" />
    </svg>
  );
}
function IconPause() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
      <path d="M3 2h3v12H3zm7 0h3v12h-3z" />
    </svg>
  );
}
function IconPrev() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
      <path d="M3.3 1.7v12.6h-1.4V1.7h1.4zm9.4 0L5.5 8l7.2 6.3V1.7z" />
    </svg>
  );
}
function IconNext() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
      <path d="M12.7 1.7v12.6h1.4V1.7h-1.4zM3.3 1.7v12.6L10.5 8 3.3 1.7z" />
    </svg>
  );
}
function IconShuffle() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
      <path d="M13.151.922a.75.75 0 1 0-1.06 1.06L13.109 3H11.16a3.75 3.75 0 0 0-2.873 1.34l-6.173 7.356A2.25 2.25 0 0 1 .39 12.25H0V13.5h.391a3.75 3.75 0 0 0 2.873-1.34l6.173-7.356A2.25 2.25 0 0 1 11.16 4.5h1.949l-1.018.982a.75.75 0 1 0 1.06 1.06l2.5-2.414.04-.04a.751.751 0 0 0-.042-1.06zM.391 3.75H0V2.5h.391c1.109 0 2.16.49 2.873 1.34L4.89 5.277l-.979 1.167-1.646-1.96A2.25 2.25 0 0 0 .39 3.75zm14.608 8H16v1.5h-.391a3.75 3.75 0 0 1-2.873-1.34l-1.626-1.934.979-1.167 1.646 1.96A2.25 2.25 0 0 0 15.609 11.75h.39z" />
    </svg>
  );
}
function IconRepeat() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
      <path d="M0 4.75A3.75 3.75 0 0 1 3.75 1h.75a.75.75 0 0 1 0 1.5h-.75A2.25 2.25 0 0 0 1.5 4.75v5A2.25 2.25 0 0 0 3.75 12H5v-1.5H3.75A.75.75 0 0 1 3 9.75v-5A.75.75 0 0 1 3.75 4h8.5a.75.75 0 0 1 .75.75v1.5h1.5v-1.5A2.25 2.25 0 0 0 12.25 2.5h-.5a.75.75 0 0 1 0-1.5h.5A3.75 3.75 0 0 1 16 4.75v1.5h-1.5V4.75a.75.75 0 0 0-.75-.75h-8.5z" />
      <path d="M16 11.25a3.75 3.75 0 0 1-3.75 3.75h-.75a.75.75 0 0 1 0-1.5h.75a2.25 2.25 0 0 0 2.25-2.25v-5a2.25 2.25 0 0 0-2.25-2.25H11V5.5h1.25a.75.75 0 0 1 .75.75v5a.75.75 0 0 1-.75.75h-8.5a.75.75 0 0 1-.75-.75V9H1.5v1.5A2.25 2.25 0 0 0 3.75 13h.5a.75.75 0 0 1 0 1.5h-.5A3.75 3.75 0 0 1 0 10.75v-1.5h1.5v1.5a.75.75 0 0 0 .75.75h8.5z" />
    </svg>
  );
}
function IconVolume() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 text-muted" fill="currentColor">
      <path d="M9.741.85a.75.75 0 0 1 .375.65v13a.75.75 0 0 1-1.125.65l-6.925-4a3.748 3.748 0 0 1-1.162-5.236l.012-.02A3.748 3.748 0 0 1 3.066 4.5H3.75l5.616-3.24A.75.75 0 0 1 9.74.85zM11.5 4a.75.75 0 0 1 .75.75v6.5a.75.75 0 0 1-1.5 0v-6.5A.75.75 0 0 1 11.5 4zm2.5 1a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 14 5z" />
    </svg>
  );
}
