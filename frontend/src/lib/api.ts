export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export type Track = {
  id: number;
  title: string;
  artist: string;
  album?: string | null;
  duration_seconds?: number | null;
  format: string;
  file_size_bytes: number;
  art_url?: string | null;
};

export async function api<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  } else if (typeof window !== "undefined") {
    const stored = sessionStorage.getItem("access_token");
    if (stored) (headers as Record<string, string>)["Authorization"] = `Bearer ${stored}`;
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    const message = typeof detail === "string" ? detail : Array.isArray(detail) ? detail[0]?.msg : res.statusText;
    throw new Error(message || res.statusText);
  }
  return res.json();
}

export function streamUrl(trackId: number) {
  return `${API_URL}/api/v1/tracks/${trackId}/stream`;
}

export function artUrl(track: Track) {
  if (!track.art_url) return null;
  return `${API_URL}${track.art_url}`;
}
