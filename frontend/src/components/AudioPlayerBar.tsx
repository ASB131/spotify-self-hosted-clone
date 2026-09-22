"use client";

import { useEffect, useRef } from "react";
import { usePlayerStore } from "@/store/player";
import { getBothAudios, getSharedAudio, onActiveAudioChange } from "@/lib/playerAudio";
import { artUrl } from "@/lib/api";
import { ArtistLinks } from "@/lib/artists";

function fmt(sec: number) {
  if (!sec || !Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** FLAC / piped streams often expose Infinity or NaN for audio.duration. */
function resolveDuration(el: HTMLAudioElement, trackSeconds?: number | null): number {
  const fromEl = el.duration;
  if (Number.isFinite(fromEl) && fromEl > 0) return fromEl;
  if (trackSeconds != null && Number.isFinite(trackSeconds) && trackSeconds > 0) return trackSeconds;
  return 0;
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
    queue,
    queuePanelOpen,
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
    toggleQueuePanel,
    tickCrossfade,
  } = usePlayerStore();

  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const audio = getSharedAudio();
    if (!audio) return;
    bindAudio(audio);
    hydrate();

    const attach = (el: HTMLAudioElement) => {
      const applyDuration = () => {
        if (el !== getSharedAudio()) return;
        const trackSec = usePlayerStore.getState().current?.duration_seconds;
        setDuration(resolveDuration(el, trackSec));
      };
      const onTime = () => {
        if (el !== getSharedAudio()) return;
        setProgress(el.currentTime);
        const trackSec = usePlayerStore.getState().current?.duration_seconds;
        tickCrossfade(el.currentTime, resolveDuration(el, trackSec));
        if (persistTimer.current) clearTimeout(persistTimer.current);
        persistTimer.current = setTimeout(() => persist(), 1500);
      };
      const onEnd = () => {
        if (el !== getSharedAudio()) return;
        onEnded();
      };
      const onPlay = () => {
        if (el !== getSharedAudio()) return;
        usePlayerStore.setState({ isPlaying: true });
      };
      const onPause = () => {
        if (el !== getSharedAudio()) return;
        usePlayerStore.setState({ isPlaying: false });
      };
      el.addEventListener("timeupdate", onTime);
      el.addEventListener("loadedmetadata", applyDuration);
      el.addEventListener("durationchange", applyDuration);
      el.addEventListener("ended", onEnd);
      el.addEventListener("play", onPlay);
      el.addEventListener("pause", onPause);
      return () => {
        el.removeEventListener("timeupdate", onTime);
        el.removeEventListener("loadedmetadata", applyDuration);
        el.removeEventListener("durationchange", applyDuration);
        el.removeEventListener("ended", onEnd);
        el.removeEventListener("play", onPlay);
        el.removeEventListener("pause", onPause);
      };
    };

    const both = getBothAudios();
    const cleanups: (() => void)[] = [];
    if (both) {
      for (const el of both) cleanups.push(attach(el));
    } else {
      cleanups.push(attach(audio));
    }

    onActiveAudioChange((el) => bindAudio(el));

    const onUnload = () => persist();
    window.addEventListener("beforeunload", onUnload);
    const onVis = () => {
      if (document.visibilityState === "hidden") persist();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cleanups.forEach((c) => c());
      onActiveAudioChange(null);
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("visibilitychange", onVis);
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [bindAudio, hydrate, persist, setDuration, setProgress, onEnded, tickCrossfade]);

  // Seed bar duration from catalog immediately (FLAC streams often report Infinity).
  useEffect(() => {
    if (!current) {
      setDuration(0);
      return;
    }
    const catalog = current.duration_seconds;
    if (catalog == null || !Number.isFinite(catalog) || catalog <= 0) return;
    const el = getSharedAudio();
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) {
      setDuration(catalog);
    }
  }, [current?.id, current?.duration_seconds, setDuration]);

  if (!current) {
    return (
      <footer className="h-[72px] rounded-lg bg-panel px-4 flex items-center text-muted text-sm shrink-0 player-bar pb-[env(safe-area-inset-bottom)]">
        Select a track to play
      </footer>
    );
  }

  const barDuration =
    Number.isFinite(duration) && duration > 0
      ? duration
      : current.duration_seconds && current.duration_seconds > 0
        ? current.duration_seconds
        : 0;
  const pct = barDuration > 0 ? Math.min(100, (progress / barDuration) * 100) : 0;
  const cover = artUrl(current);

  return (
    <footer className="min-h-[72px] md:h-[90px] rounded-lg bg-panel px-2 sm:px-3 py-2 grid grid-cols-[1fr_auto] md:grid-cols-[1fr_minmax(240px,40%)_1fr] items-center gap-2 md:gap-3 shrink-0 player-bar pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-12 w-12 md:h-14 md:w-14 rounded-sm object-cover shrink-0" />
        ) : (
          <div className="h-12 w-12 md:h-14 md:w-14 rounded-sm bg-white/10 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{current.title}</p>
          <ArtistLinks artist={current.artist} className="truncate text-xs text-muted block" linkClassName="text-muted" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 min-w-0 col-span-2 md:col-span-1 order-3 md:order-none">
        <div className="flex items-center gap-3 md:gap-4">
          <button
            type="button"
            onClick={toggleShuffle}
            className={`hidden sm:inline transition-colors ${shuffle ? "text-spotify" : "text-muted hover:text-white"}`}
            aria-label="Shuffle"
            aria-pressed={shuffle}
          >
            <IconShuffle />
          </button>
          <button type="button" onClick={prev} className="text-muted hover:text-white transition-colors p-1" aria-label="Previous">
            <IconPrev />
          </button>
          <button
            type="button"
            onClick={toggle}
            className="h-9 w-9 md:h-8 md:w-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <IconPause /> : <IconPlay />}
          </button>
          <button type="button" onClick={() => next()} className="text-muted hover:text-white transition-colors p-1" aria-label="Next">
            <IconNext />
          </button>
          <button
            type="button"
            onClick={cycleRepeat}
            className={`relative hidden sm:inline transition-colors ${repeat !== "off" ? "text-spotify" : "text-muted hover:text-white"}`}
            aria-label="Repeat"
          >
            <IconRepeat />
            {repeat === "one" && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-bold">1</span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-2 w-full text-[11px] text-muted tabular-nums">
          <span className="w-8 sm:w-10 text-right">{fmt(progress)}</span>
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
              max={barDuration || 0}
              step={0.1}
              value={progress}
              onChange={(e) => seek(Number(e.target.value))}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
              aria-label="Seek"
            />
          </div>
          <span className="w-8 sm:w-10">{fmt(barDuration)}</span>
        </div>
      </div>

      <div className="flex justify-end items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={toggleQueuePanel}
          className={`relative transition-colors p-1 ${queuePanelOpen ? "text-spotify" : "text-muted hover:text-white"}`}
          aria-label="Queue"
          aria-pressed={queuePanelOpen}
          title="Queue"
        >
          <IconQueue />
          {queue.length > 0 && (
            <span className="absolute -top-1.5 -right-2 min-w-[14px] h-3.5 px-0.5 rounded-full bg-spotify text-black text-[9px] font-bold flex items-center justify-center">
              {queue.length > 99 ? "99+" : queue.length}
            </span>
          )}
        </button>
        <span className="hidden sm:inline">
          <IconVolume />
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="hidden sm:block w-20 md:w-24 accent-white"
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

function IconQueue() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor" aria-hidden>
      <path d="M15 15H1v-1.5h14V15zm0-4.5H1V9h14v1.5zm-14-7A2.5 2.5 0 0 1 3.5 1h9a2.5 2.5 0 0 1 0 5h-9A2.5 2.5 0 0 1 1 3.5zm2.5-1a1 1 0 0 0 0 2h9a1 1 0 1 0 0-2h-9z" />
    </svg>
  );
}
