"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  videoId: string;
  title: string;
  onClose?: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: Record<string, unknown>
      ) => YtPlayer;
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number; BUFFERING: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YtPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
};

let apiLoading: Promise<void> | null = null;

function loadYtApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiLoading) return apiLoading;
  apiLoading = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
  return apiLoading;
}

function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** YouTube embed with native chrome hidden; only play/pause + scrub shown. */
export function YouTubePreview({ videoId, title, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const scrubbing = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let tick: ReturnType<typeof setInterval> | undefined;
    const host = hostRef.current;
    if (!host) return;

    void loadYtApi().then(() => {
      if (cancelled || !hostRef.current || !window.YT) return;
      hostRef.current.innerHTML = "";
      const el = document.createElement("div");
      hostRef.current.appendChild(el);
      const player = new window.YT.Player(el, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          showinfo: 0,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            playerRef.current = player;
            setReady(true);
            setDuration(player.getDuration() || 0);
            setPlaying(true);
            tick = setInterval(() => {
              if (!playerRef.current || scrubbing.current) return;
              try {
                setProgress(playerRef.current.getCurrentTime() || 0);
                setDuration(playerRef.current.getDuration() || 0);
                const st = playerRef.current.getPlayerState();
                setPlaying(st === window.YT!.PlayerState.PLAYING || st === window.YT!.PlayerState.BUFFERING);
              } catch {
                /* ignore */
              }
            }, 250);
          },
          onStateChange: (e: { data: number }) => {
            if (!window.YT) return;
            setPlaying(e.data === window.YT.PlayerState.PLAYING || e.data === window.YT.PlayerState.BUFFERING);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (tick) clearInterval(tick);
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [videoId]);

  function toggle() {
    const p = playerRef.current;
    if (!p) return;
    if (playing) p.pauseVideo();
    else p.playVideo();
  }

  return (
    <div className="px-2 pb-3">
      <div className="relative aspect-video max-w-xl rounded-md overflow-hidden bg-black border border-white/10 group">
        <div ref={hostRef} className="absolute inset-0 pointer-events-none [&>iframe]:!w-full [&>iframe]:!h-full" />
        {/* Block YouTube hover chrome; our controls sit above */}
        <div className="absolute inset-0 z-[1]" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pt-8 pb-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              disabled={!ready}
              className="shrink-0 h-9 w-9 rounded-full bg-white text-black flex items-center justify-center disabled:opacity-40"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
                  <path d="M3 2h3v12H3zm7 0h3v12h-3z" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" className="w-4 h-4 ml-0.5" fill="currentColor">
                  <path d="M3 2.5v11l10-5.5z" />
                </svg>
              )}
            </button>
            <span className="text-[11px] tabular-nums text-white/80 w-10 shrink-0">{fmt(progress)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(1, duration)}
              step={0.1}
              value={Math.min(progress, duration || 0)}
              disabled={!ready || !duration}
              onMouseDown={() => {
                scrubbing.current = true;
              }}
              onTouchStart={() => {
                scrubbing.current = true;
              }}
              onChange={(e) => setProgress(Number(e.target.value))}
              onMouseUp={(e) => {
                scrubbing.current = false;
                playerRef.current?.seekTo(Number((e.target as HTMLInputElement).value), true);
              }}
              onTouchEnd={(e) => {
                scrubbing.current = false;
                playerRef.current?.seekTo(Number((e.target as HTMLInputElement).value), true);
              }}
              className="flex-1 accent-white h-1 cursor-pointer"
              aria-label={`Seek ${title}`}
            />
            <span className="text-[11px] tabular-nums text-white/80 w-10 shrink-0 text-right">{fmt(duration)}</span>
            {onClose && (
              <button type="button" onClick={onClose} className="text-xs text-white/70 hover:text-white shrink-0">
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
