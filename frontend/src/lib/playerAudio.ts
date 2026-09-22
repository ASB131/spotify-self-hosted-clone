import type { Track } from "@/lib/api";
import { streamUrl } from "@/lib/api";

/** Singleton HTMLAudioElement — survives AppShell remounts / Strict Mode. */
let sharedAudio: HTMLAudioElement | null = null;

export function getSharedAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = "metadata";
  }
  return sharedAudio;
}
