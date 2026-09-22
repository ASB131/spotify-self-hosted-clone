import type { Track } from "@/lib/api";
import { streamUrl } from "@/lib/api";

/** Dual HTMLAudioElements for gapless / crossfade — survive AppShell remounts. */

type Slot = "a" | "b";

let audioA: HTMLAudioElement | null = null;
let audioB: HTMLAudioElement | null = null;
let activeSlot: Slot = "a";
let crossfadeSeconds = 0;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
let onActiveChange: ((el: HTMLAudioElement) => void) | null = null;

function ensure() {
  if (typeof window === "undefined") return;
  if (!audioA) {
    audioA = new Audio();
    audioA.preload = "auto";
  }
  if (!audioB) {
    audioB = new Audio();
    audioB.preload = "auto";
  }
}

export function getSharedAudio(): HTMLAudioElement | null {
  ensure();
  return activeSlot === "a" ? audioA : audioB;
}

export function getIdleAudio(): HTMLAudioElement | null {
  ensure();
  return activeSlot === "a" ? audioB : audioA;
}

export function getBothAudios(): [HTMLAudioElement, HTMLAudioElement] | null {
  ensure();
  if (!audioA || !audioB) return null;
  return [audioA, audioB];
}

export function getCrossfadeSeconds(): number {
  return crossfadeSeconds;
}

export function setCrossfadeSeconds(seconds: number) {
  crossfadeSeconds = Math.max(0, Math.min(12, seconds));
}

export function onActiveAudioChange(cb: ((el: HTMLAudioElement) => void) | null) {
  onActiveChange = cb;
}

function cancelFade() {
  if (fadeTimer) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }
}

export function loadOnActive(
  track: Track | null,
  opts?: { autoplay?: boolean; seek?: number; volume?: number }
) {
  ensure();
  const audio = getSharedAudio();
  if (!audio || !track) return;
  cancelFade();
  const idle = getIdleAudio();
  if (idle) {
    idle.pause();
    idle.removeAttribute("src");
    idle.load();
  }
  const autoplay = opts?.autoplay !== false;
  const url = streamUrl(track);
  const same = audio.dataset.trackId === String(track.id);
  if (!same) {
    audio.dataset.trackId = String(track.id);
    audio.src = url;
    audio.load();
  }
  if (opts?.volume != null) audio.volume = opts.volume;
  if (opts?.seek != null && Number.isFinite(opts.seek)) {
    const seekTo = opts.seek;
    const applySeek = () => {
      try {
        audio.currentTime = seekTo;
      } catch {
        /* ignore */
      }
    };
    if (audio.readyState >= 1) applySeek();
    else audio.addEventListener("loadedmetadata", applySeek, { once: true });
  }
  if (autoplay) {
    audio.play().catch(() => undefined);
  }
}

/** Preload next track onto the idle element (muted / paused). */
export function preloadIdle(track: Track, volume = 0) {
  ensure();
  const idle = getIdleAudio();
  if (!idle) return;
  const url = streamUrl(track);
  if (idle.dataset.trackId === String(track.id) && idle.src) return;
  idle.dataset.trackId = String(track.id);
  idle.src = url;
  idle.volume = volume;
  idle.load();
}

/**
 * Swap to idle element which already has `track` loaded, or load it now.
 * Used for gapless (0s) and after crossfade completes.
 */
export function promoteIdle(
  track: Track,
  opts?: { autoplay?: boolean; volume?: number }
): HTMLAudioElement | null {
  ensure();
  cancelFade();
  const idle = getIdleAudio();
  const prev = getSharedAudio();
  if (!idle) return null;
  const url = streamUrl(track);
  if (idle.dataset.trackId !== String(track.id)) {
    idle.dataset.trackId = String(track.id);
    idle.src = url;
    idle.load();
  }
  const vol = opts?.volume ?? 1;
  idle.volume = vol;
  idle.currentTime = 0;
  if (opts?.autoplay !== false) {
    idle.play().catch(() => undefined);
  }
  if (prev) {
    prev.pause();
    prev.volume = 0;
  }
  activeSlot = activeSlot === "a" ? "b" : "a";
  const active = getSharedAudio();
  if (active) onActiveChange?.(active);
  return active;
}

/**
 * Crossfade from active → idle over `crossfadeSeconds`.
 * Idle must already be preloaded with next track.
 */
export function crossfadeToIdle(
  track: Track,
  targetVolume: number,
  onDone?: () => void
): boolean {
  ensure();
  const ms = crossfadeSeconds * 1000;
  if (ms <= 0) {
    promoteIdle(track, { autoplay: true, volume: targetVolume });
    onDone?.();
    return true;
  }
  const idle = getIdleAudio();
  const active = getSharedAudio();
  if (!idle || !active) return false;

  if (idle.dataset.trackId !== String(track.id)) {
    preloadIdle(track, 0);
  }

  cancelFade();
  idle.volume = 0;
  idle.currentTime = 0;
  idle.play().catch(() => undefined);

  const start = Date.now();
  const fromVol = active.volume;
  fadeTimer = setInterval(() => {
    const t = Math.min(1, (Date.now() - start) / ms);
    active.volume = fromVol * (1 - t);
    idle.volume = targetVolume * t;
    if (t >= 1) {
      cancelFade();
      active.pause();
      active.volume = 0;
      activeSlot = activeSlot === "a" ? "b" : "a";
      const next = getSharedAudio();
      if (next) {
        next.volume = targetVolume;
        onActiveChange?.(next);
      }
      onDone?.();
    }
  }, 40);
  return true;
}

export function pauseAll() {
  cancelFade();
  audioA?.pause();
  audioB?.pause();
}
