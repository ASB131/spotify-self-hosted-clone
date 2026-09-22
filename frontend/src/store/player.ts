import { create } from "zustand";
import type { Track } from "@/lib/api";
import { streamUrl } from "@/lib/api";

type PlayerState = {
  current: Track | null;
  isPlaying: boolean;
  volume: number;
  progress: number;
  duration: number;
  setTrack: (track: Track | null) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  setVolume: (v: number) => void;
  setProgress: (p: number) => void;
  setDuration: (d: number) => void;
  audioRef: HTMLAudioElement | null;
  bindAudio: (el: HTMLAudioElement | null) => void;
};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  current: null,
  isPlaying: false,
  volume: 0.8,
  progress: 0,
  duration: 0,
  audioRef: null,
  setTrack: (track) => {
    const audio = get().audioRef;
    set({ current: track, progress: 0, isPlaying: !!track });
    if (audio && track) {
      audio.src = streamUrl(track.id);
      audio.load();
      audio.play().catch(() => set({ isPlaying: false }));
    }
  },
  play: () => {
    get().audioRef?.play();
    set({ isPlaying: true });
  },
  pause: () => {
    get().audioRef?.pause();
    set({ isPlaying: false });
  },
  toggle: () => {
    get().isPlaying ? get().pause() : get().play();
  },
  setVolume: (v) => {
    const audio = get().audioRef;
    if (audio) audio.volume = v;
    set({ volume: v });
  },
  setProgress: (p) => set({ progress: p }),
  setDuration: (d) => set({ duration: d }),
  bindAudio: (el) => set({ audioRef: el }),
}));
