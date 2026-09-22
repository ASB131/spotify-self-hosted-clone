import { create } from "zustand";
import type { Track } from "@/lib/api";
import { streamUrl } from "@/lib/api";
import { getSharedAudio } from "@/lib/playerAudio";

export type RepeatMode = "off" | "all" | "one";

const STORAGE_KEY = "resonance-player-v1";

type PersistedPlayer = {
  queue: Track[];
  queueIndex: number;
  current: Track | null;
  progress: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  wasPlaying: boolean;
};

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
  hydrated: boolean;
  audioRef: HTMLAudioElement | null;
  bindAudio: (el: HTMLAudioElement | null) => void;
  hydrate: () => void;
  persist: () => void;
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

function loadTrack(audio: HTMLAudioElement | null, track: Track | null, opts?: { autoplay?: boolean; seek?: number }) {
  if (!audio || !track) return;
  const autoplay = opts?.autoplay !== false;
  const url = streamUrl(track);
  const same = audio.dataset.trackId === String(track.id);
  if (!same) {
    audio.dataset.trackId = String(track.id);
    audio.src = url;
    audio.load();
  }
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
    audio.play().catch(() => usePlayerStore.setState({ isPlaying: false }));
  }
}

function readPersisted(): PersistedPlayer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedPlayer;
  } catch {
    return null;
  }
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
  hydrated: false,
  audioRef: null,

  bindAudio: (el) => set({ audioRef: el }),

  persist: () => {
    if (typeof window === "undefined") return;
    const s = get();
    if (!s.hydrated) return;
    const payload: PersistedPlayer = {
      queue: s.queue,
      queueIndex: s.queueIndex,
      current: s.current,
      progress: s.progress,
      volume: s.volume,
      shuffle: s.shuffle,
      repeat: s.repeat,
      wasPlaying: s.isPlaying,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* quota */
    }
  },

  hydrate: () => {
    if (get().hydrated) return;
    const audio = getSharedAudio();
    const saved = readPersisted();
    if (!saved?.current || !saved.queue?.length) {
      set({ hydrated: true, audioRef: audio, volume: saved?.volume ?? 0.8 });
      if (audio && saved?.volume != null) audio.volume = saved.volume;
      return;
    }
    const idx = Math.max(0, Math.min(saved.queueIndex, saved.queue.length - 1));
    const track = saved.queue[idx] || saved.current;
    set({
      hydrated: true,
      audioRef: audio,
      queue: saved.queue,
      queueIndex: idx,
      current: track,
      progress: saved.progress || 0,
      volume: saved.volume ?? 0.8,
      shuffle: !!saved.shuffle,
      repeat: saved.repeat || "off",
      isPlaying: false,
    });
    if (audio) {
      audio.volume = saved.volume ?? 0.8;
      loadTrack(audio, track, { autoplay: false, seek: saved.progress || 0 });
      // Soft resume if it was playing (may be blocked until user gesture)
      if (saved.wasPlaying) {
        audio
          .play()
          .then(() => set({ isPlaying: true }))
          .catch(() => set({ isPlaying: false }));
      }
    }
  },

  setQueue: (tracks, startIndex = 0) => {
    if (!tracks.length) {
      set({ queue: [], queueIndex: -1, current: null, isPlaying: false, progress: 0 });
      get().persist();
      return;
    }
    const idx = Math.max(0, Math.min(startIndex, tracks.length - 1));
    const track = tracks[idx];
    set({ queue: tracks, queueIndex: idx, current: track, progress: 0, isPlaying: true });
    loadTrack(get().audioRef || getSharedAudio(), track, { autoplay: true });
    get().persist();
  },

  playTrackInContext: (track, context) => {
    const idx = context.findIndex((t) => t.id === track.id);
    if (idx >= 0) get().setQueue(context, idx);
    else get().setQueue([track, ...context], 0);
  },

  setTrack: (track) => {
    if (!track) {
      get().audioRef?.pause();
      set({ current: null, isPlaying: false, progress: 0 });
      get().persist();
      return;
    }
    const { queue } = get();
    const idx = queue.findIndex((t) => t.id === track.id);
    if (idx >= 0) {
      set({ current: track, queueIndex: idx, progress: 0, isPlaying: true });
    } else {
      set({ current: track, queue: [track], queueIndex: 0, progress: 0, isPlaying: true });
    }
    loadTrack(get().audioRef || getSharedAudio(), track, { autoplay: true });
    get().persist();
  },

  play: () => {
    const audio = get().audioRef || getSharedAudio();
    audio?.play().catch(() => undefined);
    set({ isPlaying: true });
    get().persist();
  },

  pause: () => {
    (get().audioRef || getSharedAudio())?.pause();
    set({ isPlaying: false });
    get().persist();
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
    loadTrack(get().audioRef || getSharedAudio(), track, { autoplay: true });
    get().persist();
  },

  prev: () => {
    const { queue, queueIndex, progress, audioRef } = get();
    if (!queue.length) return;
    const audio = audioRef || getSharedAudio();
    if (progress > 3 && audio) {
      audio.currentTime = 0;
      set({ progress: 0 });
      get().persist();
      return;
    }
    const prevIdx = queueIndex <= 0 ? queue.length - 1 : queueIndex - 1;
    const track = queue[prevIdx];
    set({ current: track, queueIndex: prevIdx, progress: 0, isPlaying: true });
    loadTrack(audio, track, { autoplay: true });
    get().persist();
  },

  toggleShuffle: () => {
    set({ shuffle: !get().shuffle });
    get().persist();
  },

  cycleRepeat: () => {
    const order: RepeatMode[] = ["off", "all", "one"];
    const i = order.indexOf(get().repeat);
    set({ repeat: order[(i + 1) % order.length] });
    get().persist();
  },

  setVolume: (v) => {
    const audio = get().audioRef || getSharedAudio();
    if (audio) audio.volume = v;
    set({ volume: v });
    get().persist();
  },

  setProgress: (p) => set({ progress: p }),
  setDuration: (d) => set({ duration: d }),

  seek: (seconds) => {
    const audio = get().audioRef || getSharedAudio();
    if (audio && Number.isFinite(seconds)) {
      audio.currentTime = seconds;
      set({ progress: seconds });
      get().persist();
    }
  },

  onEnded: () => {
    const { repeat, audioRef } = get();
    const audio = audioRef || getSharedAudio();
    if (repeat === "one" && audio) {
      audio.currentTime = 0;
      audio.play().catch(() => undefined);
      set({ isPlaying: true, progress: 0 });
      get().persist();
      return;
    }
    const { queue, queueIndex, shuffle } = get();
    if (!queue.length) {
      set({ isPlaying: false });
      get().persist();
      return;
    }
    const atEnd = !shuffle && queueIndex >= queue.length - 1;
    if (atEnd && get().repeat === "off") {
      set({ isPlaying: false });
      get().persist();
      return;
    }
    get().next();
  },
}));
