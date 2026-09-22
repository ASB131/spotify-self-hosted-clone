export type Track = {
  id: number;
  title: string;
  artist: string;
  album?: string | null;
  duration_seconds?: number | null;
  format: string;
  file_size_bytes: number;
  source?: string | null;
  added_via?: string | null;
  art_url?: string | null;
  added_at?: string | null;
};

export type Playlist = {
  id: number;
  name: string;
  description?: string | null;
  is_liked_songs: boolean;
  track_count: number;
  cover_url?: string | null;
};

export function getApiUrl(): string {
  const env = (process.env.NEXT_PUBLIC_API_URL || "").trim();
  if (typeof window !== "undefined") {
    // Baked-in localhost breaks LAN/server deploys — use same-origin (Next.js proxies /api).
    if (!env || isLoopbackUrl(env)) {
      return window.location.origin;
    }
    return env.replace(/\/$/, "");
  }
  if (env && !isLoopbackUrl(env)) {
    return env.replace(/\/$/, "");
  }
  return process.env.INTERNAL_API_URL || "http://127.0.0.1:8000";
}

function isLoopbackUrl(url: string): boolean {
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url.trim());
}

/** Direct API origin for OAuth redirects (browser must reach FastAPI with auth cookies). */
export function getOAuthApiUrl(): string {
  if (typeof window !== "undefined") {
    const runtime = (window as unknown as { __RESONANCE_API_DIRECT__?: string }).__RESONANCE_API_DIRECT__;
    if (runtime && runtime.trim()) return runtime.replace(/\/$/, "");
  }
  const direct = (process.env.NEXT_PUBLIC_API_DIRECT_URL || "").trim();
  if (direct && !isLoopbackUrl(direct)) return direct.replace(/\/$/, "");
  // Same-origin login works via proxy; OAuth needs a real API host from .env API_DIRECT_URL
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://127.0.0.1:8000";
}

/** @deprecated use getApiUrl() for fetches so Docker can proxy via the web app */
export const API_URL = typeof window !== "undefined" ? getApiUrl() : process.env.NEXT_PUBLIC_API_URL || "";

export function getWsUrl(): string {
  if (typeof window !== "undefined") {
    const runtime = (window as unknown as { __RESONANCE_WS__?: string }).__RESONANCE_WS__;
    if (runtime && runtime.trim()) return runtime.replace(/\/$/, "");
  }
  const env = (process.env.NEXT_PUBLIC_WS_URL || "").trim();
  if (env && !isLoopbackUrl(env.replace(/^ws/i, "http"))) {
    return env.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    const direct = getOAuthApiUrl();
    try {
      const u = new URL(direct);
      return `${u.protocol === "https:" ? "wss:" : "ws:"}//${u.host}`;
    } catch {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${window.location.host}`;
    }
  }
  return "ws://127.0.0.1:8000";
}

export const WS_URL = typeof window !== "undefined" ? "" : process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";


export async function api<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
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
  const res = await fetch(`${getApiUrl()}${path}`, {
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

export async function downloadBlob(path: string): Promise<Blob> {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("access_token") : null;
  const headers: HeadersInit = {};
  if (token) (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${getApiUrl()}${path}`, { credentials: "include", headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || res.statusText || "Download failed");
  }
  return res.blob();
}

export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("access_token") : null;
  const form = new FormData();
  form.append("file", file);
  const headers: HeadersInit = {};
  if (token) (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${getApiUrl()}${path}`, {
    method: "POST",
    credentials: "include",
    headers,
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || res.statusText || "Upload failed");
  }
  return res.json();
}

export function streamUrl(track: Track | number) {
  const id = typeof track === "number" ? track : track.id;
  return `${getApiUrl()}/api/v1/tracks/${id}/stream`;
}

export function artUrl(track: Track) {
  if (!track.art_url) return null;
  return `${getApiUrl()}${track.art_url}`;
}
