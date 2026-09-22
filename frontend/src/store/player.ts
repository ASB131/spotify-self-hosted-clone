import { create } from "zustand";
import type { Track } from "@/lib/api";
import { streamUrl } from "@/lib/api";

export type RepeatMode = "off" | "all" | "one";

type PlayerState = {
  current: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  progress: number;
  duration: number;
  audioRef: HTMLAudioElement | null;
  bindAudio: (el: HTMLAudioElement | null) => void;
  setQueue: (tracks: Track[], startIndex?: number) => void;
  playTrackInContext: (track: Track, context: Track[]) => void;
  setTrack: (track: Track | null) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setVolume: (v: number) => void;
  setProgress: (p: number) => void;
  setDuration: (d: number) => void;
  seek: (seconds: number) => void;
  onEnded: () => void;
};

function loadTrack(audio: HTMLAudioElement | null, track: Track | null) {
  if (!audio || !track) return;
  audio.src = streamUrl(track);
  audio.load();
  audio.play().catch(() => usePlayerStore.setState({ isPlaying: false }));
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  current: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  shuffle: false,
  repeat: "off",
  volume: 0.8,
  progress: 0,
  duration: 0,
  audioRef: null,

  bindAudio: (el) => set({ audioRef: el }),

  setQueue: (tracks, startIndex = 0) => {
    if (!tracks.length) {
      set({ queue: [], queueIndex: -1, current: null, isPlaying: false });
      return;
    }
    const idx = Math.max(0, Math.min(startIndex, tracks.length - 1));
    const track = tracks[idx];
    set({ queue: tracks, queueIndex: idx, current: track, progress: 0, isPlaying: true });
    loadTrack(get().audioRef, track);
  },

  playTrackInContext: (track, context) => {
    const idx = context.findIndex((t) => t.id === track.id);
    if (idx >= 0) {
      get().setQueue(context, idx);
    } else {
      get().setQueue([track, ...context], 0);
    }
  },

  setTrack: (track) => {
    if (!track) {
      get().audioRef?.pause();
      set({ current: null, isPlaying: false, progress: 0 });
      return;
    }
    const { queue } = get();
    const idx = queue.findIndex((t) => t.id === track.id);
    if (idx >= 0) {
      set({ current: track, queueIndex: idx, progress: 0, isPlaying: true });
    } else {
      set({ current: track, queue: [track], queueIndex: 0, progress: 0, isPlaying: true });
    }
    loadTrack(get().audioRef, track);
  },

  play: () => {
    get().audioRef?.play().catch(() => undefined);
    set({ isPlaying: true });
  },

  pause: () => {
    get().audioRef?.pause();
    set({ isPlaying: false });
  },

  toggle: () => {
    get().isPlaying ? get().pause() : get().play();
  },

  next: () => {
    const { queue, queueIndex, shuffle, repeat } = get();
    if (!queue.length) return;
    let nextIdx: number;
    if (shuffle) {
      if (queue.length === 1) nextIdx = 0;
      else {
        do {
          nextIdx = Math.floor(Math.random() * queue.length);
        } while (nextIdx === queueIndex);
      }
    } else if (queueIndex >= queue.length - 1) {
      if (repeat === "all") nextIdx = 0;
      else return;
    } else {
      nextIdx = queueIndex + 1;
    }
    const track = queue[nextIdx];
    set({ current: track, queueIndex: nextIdx, progress: 0, isPlaying: true });
    loadTrack(get().audioRef, track);
  },

  prev: () => {
    const { queue, queueIndex, progress, audioRef } = get();
    if (!queue.length) return;
    if (progress > 3 && audioRef) {
      audioRef.currentTime = 0;
      set({ progress: 0 });
      return;
    }
    const prevIdx = queueIndex <= 0 ? queue.length - 1 : queueIndex - 1;
    const track = queue[prevIdx];
    set({ current: track, queueIndex: prevIdx, progress: 0, isPlaying: true });
    loadTrack(get().audioRef, track);
  },

  toggleShuffle: () => set({ shuffle: !get().shuffle }),

  cycleRepeat: () => {
    const order: RepeatMode[] = ["off", "all", "one"];
    const i = order.indexOf(get().repeat);
    set({ repeat: order[(i + 1) % order.length] });
  },

  setVolume: (v) => {
    const audio = get().audioRef;
    if (audio) audio.volume = v;
    set({ volume: v });
  },

  setProgress: (p) => set({ progress: p }),
  setDuration: (d) => set({ duration: d }),

  seek: (seconds) => {
    const audio = get().audioRef;
    if (audio && Number.isFinite(seconds)) {
      audio.currentTime = seconds;
      set({ progress: seconds });
    }
  },

  onEnded: () => {
    const { repeat, audioRef } = get();
    if (repeat === "one" && audioRef) {
      audioRef.currentTime = 0;
      audioRef.play().catch(() => undefined);
      set({ isPlaying: true, progress: 0 });
      return;
    }
    const { queue, queueIndex, shuffle } = get();
    if (!queue.length) {
      set({ isPlaying: false });
      return;
    }
    const atEnd = !shuffle && queueIndex >= queue.length - 1;
    if (atEnd && get().repeat === "off") {
      set({ isPlaying: false });
      return;
    }
    get().next();
  },
}));
