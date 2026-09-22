import { create } from "zustand";
import type { Track } from "@/lib/api";
import {
  crossfadeToIdle,
  getCrossfadeSeconds,
  getSharedAudio,
  loadOnActive,
  pauseAll,
  preloadIdle,
  promoteIdle,
  setCrossfadeSeconds as setAudioCrossfade,
} from "@/lib/playerAudio";
import { recordPlay } from "@/lib/plays";

export type RepeatMode = "off" | "all" | "one";

const STORAGE_KEY = "mix-player-v2";

type PersistedPlayer = {
  queue: Track[];
  queueIndex: number;
  current: Track | null;
  progress: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  wasPlaying: boolean;
  crossfadeSeconds?: number;
  sourcePlaylistId?: number | null;
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
  crossfadeSeconds: number;
  sourcePlaylistId: number | null;
  bindAudio: (el: HTMLAudioElement | null) => void;
  hydrate: () => void;
  persist: () => void;
  queuePanelOpen: boolean;
  setQueuePanelOpen: (open: boolean) => void;
  toggleQueuePanel: () => void;
  setCrossfadeSeconds: (s: number) => void;
  setSourcePlaylistId: (id: number | null) => void;
  setQueue: (tracks: Track[], startIndex?: number, playlistId?: number | null) => void;
  playTrackInContext: (track: Track, context: Track[], playlistId?: number | null) => void;
  addToQueue: (tracks: Track | Track[]) => void;
  playNext: (tracks: Track | Track[]) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  playAt: (index: number) => void;
  clearQueue: () => void;
  clearQueueFully: () => void;
  setTrack: (track: Track | null) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: (opts?: { fromCrossfade?: boolean }) => void;
  prev: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setVolume: (v: number) => void;
  setProgress: (p: number) => void;
  setDuration: (d: number) => void;
  seek: (seconds: number) => void;
  onEnded: () => void;
  tickCrossfade: (currentTime: number, duration: number) => void;
};

function resolveNextIndex(
  queue: Track[],
  queueIndex: number,
  shuffle: boolean,
  repeat: RepeatMode
): number | null {
  if (!queue.length) return null;
  if (shuffle) {
    if (queue.length === 1) return 0;
    let nextIdx: number;
    do {
      nextIdx = Math.floor(Math.random() * queue.length);
    } while (nextIdx === queueIndex);
    return nextIdx;
  }
  if (queueIndex >= queue.length - 1) {
    if (repeat === "all") return 0;
    return null;
  }
  return queueIndex + 1;
}

let crossfadeArmed = false;

function catalogDuration(track: Track | null | undefined): number {
  const d = track?.duration_seconds;
  return d != null && Number.isFinite(d) && d > 0 ? d : 0;
}

function loadTrack(track: Track | null, opts?: { autoplay?: boolean; seek?: number; volume?: number }) {
  loadOnActive(track, opts);
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
  queuePanelOpen: false,
  crossfadeSeconds: 0,
  sourcePlaylistId: null,

  bindAudio: (el) => set({ audioRef: el }),

  setQueuePanelOpen: (open) => set({ queuePanelOpen: open }),
  toggleQueuePanel: () => set({ queuePanelOpen: !get().queuePanelOpen }),

  setCrossfadeSeconds: (s) => {
    const v = Math.max(0, Math.min(12, s));
    setAudioCrossfade(v);
    set({ crossfadeSeconds: v });
    get().persist();
  },

  setSourcePlaylistId: (id) => set({ sourcePlaylistId: id }),

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
      crossfadeSeconds: s.crossfadeSeconds,
      sourcePlaylistId: s.sourcePlaylistId,
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
    const cf = saved?.crossfadeSeconds ?? 0;
    setAudioCrossfade(cf);
    if (!saved?.current || !saved.queue?.length) {
      set({
        hydrated: true,
        audioRef: audio,
        volume: saved?.volume ?? 0.8,
        crossfadeSeconds: cf,
        sourcePlaylistId: saved?.sourcePlaylistId ?? null,
      });
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
      duration: catalogDuration(track),
      volume: saved.volume ?? 0.8,
      shuffle: !!saved.shuffle,
      repeat: saved.repeat || "off",
      isPlaying: false,
      crossfadeSeconds: cf,
      sourcePlaylistId: saved.sourcePlaylistId ?? null,
    });
    if (audio) {
      audio.volume = saved.volume ?? 0.8;
      loadTrack(track, { autoplay: false, seek: saved.progress || 0, volume: saved.volume ?? 0.8 });
      if (saved.wasPlaying) {
        audio
          .play()
          .then(() => set({ isPlaying: true }))
          .catch(() => set({ isPlaying: false }));
      }
    }
  },

  setQueue: (tracks, startIndex = 0, playlistId) => {
    crossfadeArmed = false;
    if (!tracks.length) {
      pauseAll();
      set({
        queue: [],
        queueIndex: -1,
        current: null,
        isPlaying: false,
        progress: 0,
        sourcePlaylistId: playlistId ?? null,
      });
      get().persist();
      return;
    }
    const idx = Math.max(0, Math.min(startIndex, tracks.length - 1));
    const track = tracks[idx];
    const pl = playlistId !== undefined ? playlistId : get().sourcePlaylistId;
    set({
      queue: tracks,
      queueIndex: idx,
      current: track,
      progress: 0,
      duration: catalogDuration(track),
      isPlaying: true,
      sourcePlaylistId: pl ?? null,
    });
    loadTrack(track, { autoplay: true, volume: get().volume });
    recordPlay(track.id, pl);
    get().persist();
  },

  playTrackInContext: (track, context, playlistId) => {
    const idx = context.findIndex((t) => t.id === track.id);
    if (idx >= 0) get().setQueue(context, idx, playlistId);
    else get().setQueue([track, ...context], 0, playlistId);
  },

  addToQueue: (tracks) => {
    const list = Array.isArray(tracks) ? tracks : [tracks];
    if (!list.length) return;
    const { queue, current } = get();
    if (!queue.length || !current) {
      get().setQueue(list, 0);
      return;
    }
    set({ queue: [...queue, ...list] });
    get().persist();
  },

  playNext: (tracks) => {
    const list = Array.isArray(tracks) ? tracks : [tracks];
    if (!list.length) return;
    const { queue, queueIndex, current } = get();
    if (!queue.length || !current || queueIndex < 0) {
      get().setQueue(list, 0);
      return;
    }
    const next = [...queue];
    next.splice(queueIndex + 1, 0, ...list);
    set({ queue: next });
    get().persist();
  },

  removeFromQueue: (index) => {
    const { queue, queueIndex } = get();
    if (index < 0 || index >= queue.length) return;
    const nextQueue = queue.filter((_, i) => i !== index);
    if (!nextQueue.length) {
      pauseAll();
      set({ queue: [], queueIndex: -1, current: null, isPlaying: false, progress: 0 });
      get().persist();
      return;
    }
    let nextIndex = queueIndex;
    let shouldReload = false;
    if (index < queueIndex) nextIndex = queueIndex - 1;
    else if (index === queueIndex) {
      nextIndex = Math.min(index, nextQueue.length - 1);
      shouldReload = true;
    }
    const track = nextQueue[nextIndex];
    set({ queue: nextQueue, queueIndex: nextIndex, current: track });
    if (shouldReload) {
      crossfadeArmed = false;
      set({ progress: 0, isPlaying: true });
      loadTrack(track, { autoplay: true, volume: get().volume });
    }
    get().persist();
  },

  reorderQueue: (fromIndex, toIndex) => {
    const { queue, queueIndex } = get();
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= queue.length ||
      toIndex >= queue.length
    ) {
      return;
    }
    const next = [...queue];
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    let nextIndex = queueIndex;
    if (queueIndex === fromIndex) nextIndex = toIndex;
    else if (fromIndex < queueIndex && toIndex >= queueIndex) nextIndex = queueIndex - 1;
    else if (fromIndex > queueIndex && toIndex <= queueIndex) nextIndex = queueIndex + 1;
    set({ queue: next, queueIndex: nextIndex, current: next[nextIndex] });
    get().persist();
  },

  playAt: (index) => {
    const { queue, sourcePlaylistId } = get();
    if (index < 0 || index >= queue.length) return;
    crossfadeArmed = false;
    const track = queue[index];
    set({
      current: track,
      queueIndex: index,
      progress: 0,
      duration: catalogDuration(track),
      isPlaying: true,
    });
    loadTrack(track, { autoplay: true, volume: get().volume });
    recordPlay(track.id, sourcePlaylistId);
    get().persist();
  },

  clearQueue: () => {
    const { queueIndex, current } = get();
    if (!current || queueIndex < 0) {
      get().setQueue([]);
      return;
    }
    set({ queue: [current], queueIndex: 0 });
    get().persist();
  },

  clearQueueFully: () => {
    crossfadeArmed = false;
    pauseAll();
    set({ queue: [], queueIndex: -1, current: null, isPlaying: false, progress: 0, duration: 0 });
    get().persist();
  },

  setTrack: (track) => {
    crossfadeArmed = false;
    if (!track) {
      pauseAll();
      set({ current: null, isPlaying: false, progress: 0, duration: 0 });
      get().persist();
      return;
    }
    const { queue, sourcePlaylistId } = get();
    const idx = queue.findIndex((t) => t.id === track.id);
    const dur = catalogDuration(track);
    if (idx >= 0) {
      set({ current: track, queueIndex: idx, progress: 0, duration: dur, isPlaying: true });
    } else {
      set({
        current: track,
        queue: [track],
        queueIndex: 0,
        progress: 0,
        duration: dur,
        isPlaying: true,
      });
    }
    loadTrack(track, { autoplay: true, volume: get().volume });
    recordPlay(track.id, sourcePlaylistId);
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

  next: (opts) => {
    const { queue, queueIndex, shuffle, repeat, volume, sourcePlaylistId, crossfadeSeconds } = get();
    const nextIdx = resolveNextIndex(queue, queueIndex, shuffle, repeat);
    if (nextIdx == null) return;
    const track = queue[nextIdx];
    crossfadeArmed = false;
    set({
      current: track,
      queueIndex: nextIdx,
      progress: 0,
      duration: catalogDuration(track),
      isPlaying: true,
    });

    if (opts?.fromCrossfade && crossfadeSeconds > 0) {
      crossfadeToIdle(track, volume, () => {
        set({ audioRef: getSharedAudio() });
      });
    } else if (getCrossfadeSeconds() === 0 && opts?.fromCrossfade) {
      promoteIdle(track, { autoplay: true, volume });
      set({ audioRef: getSharedAudio() });
    } else {
      loadTrack(track, { autoplay: true, volume });
    }

    recordPlay(track.id, sourcePlaylistId);
    get().persist();
  },

  prev: () => {
    const { queue, queueIndex, progress, volume, sourcePlaylistId } = get();
    if (!queue.length) return;
    const audio = get().audioRef || getSharedAudio();
    if (progress > 3 && audio) {
      audio.currentTime = 0;
      set({ progress: 0 });
      get().persist();
      return;
    }
    crossfadeArmed = false;
    const prevIdx = queueIndex <= 0 ? queue.length - 1 : queueIndex - 1;
    const track = queue[prevIdx];
    set({
      current: track,
      queueIndex: prevIdx,
      progress: 0,
      duration: catalogDuration(track),
      isPlaying: true,
    });
    loadTrack(track, { autoplay: true, volume });
    recordPlay(track.id, sourcePlaylistId);
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
  setDuration: (d) => {
    if (Number.isFinite(d) && d > 0) {
      set({ duration: d });
      return;
    }
    const fallback = catalogDuration(get().current);
    set({ duration: fallback });
  },

  seek: (seconds) => {
    const audio = get().audioRef || getSharedAudio();
    if (audio && Number.isFinite(seconds)) {
      audio.currentTime = seconds;
      set({ progress: seconds });
      crossfadeArmed = false;
      get().persist();
    }
  },

  tickCrossfade: (currentTime, duration) => {
    const { crossfadeSeconds, isPlaying, repeat, queue, queueIndex, shuffle } = get();
    const dur = Number.isFinite(duration) && duration > 0 ? duration : catalogDuration(get().current);
    if (!isPlaying || !dur || crossfadeSeconds <= 0 || repeat === "one") return;
    if (crossfadeArmed) return;
    const remaining = dur - currentTime;
    if (remaining > crossfadeSeconds + 0.15) return;
    const nextIdx = resolveNextIndex(queue, queueIndex, shuffle, repeat);
    if (nextIdx == null) return;
    crossfadeArmed = true;
    preloadIdle(queue[nextIdx], 0);
    get().next({ fromCrossfade: true });
  },

  onEnded: () => {
    const { repeat, audioRef, crossfadeSeconds } = get();
    if (crossfadeArmed && crossfadeSeconds > 0) {
      crossfadeArmed = false;
      return;
    }
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
    const nextIdx = resolveNextIndex(queue, queueIndex, shuffle, get().repeat);
    if (nextIdx != null && crossfadeSeconds === 0) {
      preloadIdle(queue[nextIdx], get().volume);
      get().next({ fromCrossfade: true });
      return;
    }
    get().next();
  },
}));
