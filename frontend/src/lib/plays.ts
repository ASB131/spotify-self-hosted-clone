/** Fire-and-forget play history for recently played. */
import { api } from "@/lib/api";

let lastSent = { trackId: 0, at: 0 };

export function recordPlay(trackId: number, playlistId?: number | null) {
  if (typeof window === "undefined" || !trackId) return;
  const now = Date.now();
  if (lastSent.trackId === trackId && now - lastSent.at < 8000) return;
  lastSent = { trackId, at: now };
  void api("/api/v1/me/plays", {
    method: "POST",
    body: JSON.stringify({ track_id: trackId, playlist_id: playlistId ?? null }),
  }).catch(() => undefined);
}
