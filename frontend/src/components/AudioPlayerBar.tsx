"use client";

import { useEffect } from "react";
import { usePlayerStore } from "@/store/player";
import { artUrl } from "@/lib/api";

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
    toggle,
    setVolume,
    setProgress,
    setDuration,
    bindAudio,
  } = usePlayerStore();

  useEffect(() => {
    const audio = new Audio();
    audio.volume = volume;
    bindAudio(audio);
    audio.addEventListener("timeupdate", () => setProgress(audio.currentTime));
    audio.addEventListener("loadedmetadata", () => setDuration(audio.duration));
    audio.addEventListener("ended", () => usePlayerStore.setState({ isPlaying: false }));
    return () => bindAudio(null);
  }, [bindAudio, setDuration, setProgress, volume]);

  if (!current) {
    return (
      <footer className="h-20 border-t border-white/10 bg-panel px-4 flex items-center text-muted text-sm">
        Select a track to play
      </footer>
    );
  }

  const cover = artUrl(current);

  return (
    <footer className="h-24 border-t border-white/10 bg-panel px-4 grid grid-cols-3 items-center gap-4">
      <div className="flex items-center gap-3 min-w-0">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-14 w-14 rounded object-cover" />
        ) : (
          <div className="h-14 w-14 rounded bg-white/10" />
        )}
        <div className="min-w-0">
          <p className="truncate font-medium">{current.title}</p>
          <p className="truncate text-sm text-muted">{current.artist}</p>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={toggle}
          className="h-10 w-10 rounded-full bg-white text-black font-bold"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>
        <div className="flex items-center gap-2 w-full max-w-md text-xs text-muted">
          <span>{fmt(progress)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={progress}
            onChange={(e) => {
              const audio = usePlayerStore.getState().audioRef;
              const t = Number(e.target.value);
              if (audio) audio.currentTime = t;
              setProgress(t);
            }}
            className="flex-1 accent-spotify"
          />
          <span>{fmt(duration)}</span>
        </div>
      </div>
      <div className="flex justify-end items-center gap-2">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-28 accent-spotify"
          aria-label="Volume"
        />
      </div>
    </footer>
  );
}
