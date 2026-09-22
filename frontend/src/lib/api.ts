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

function isPrivateHostname(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i.test(
    host,
  );
}

/** Prefer same-origin when the page is public but runtime URLs point at LAN. */
function sameOriginWs(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}`;
}

/** Direct API origin for OAuth redirects (browser must reach FastAPI with auth cookies). */
export function getOAuthApiUrl(): string {
  if (typeof window !== "undefined") {
    const runtime = (window as unknown as { __RESONANCE_API_DIRECT__?: string }).__RESONANCE_API_DIRECT__;
    if (runtime && runtime.trim()) {
      try {
        const u = new URL(runtime);
        // Public hostname must not call LAN API (breaks CORS / local-network permission)
        if (isPrivateHostname(u.hostname) && u.hostname !== window.location.hostname) {
          return window.location.origin;
        }
      } catch {
        /* fall through */
      }
      return runtime.replace(/\/$/, "");
    }
  }
  const direct = (process.env.NEXT_PUBLIC_API_DIRECT_URL || "").trim();
  if (direct && !isLoopbackUrl(direct)) {
    if (typeof window !== "undefined") {
      try {
        const u = new URL(direct);
        if (isPrivateHostname(u.hostname) && u.hostname !== window.location.hostname) {
          return window.location.origin;
        }
      } catch {
        /* ignore */
      }
    }
    return direct.replace(/\/$/, "");
  }
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
    if (runtime && runtime.trim()) {
      try {
        const u = new URL(runtime.replace(/^ws/i, "http"));
        if (isPrivateHostname(u.hostname) && u.hostname !== window.location.hostname) {
          return sameOriginWs();
        }
      } catch {
        /* ignore */
      }
      return runtime.replace(/\/$/, "");
    }
  }
  const env = (process.env.NEXT_PUBLIC_WS_URL || "").trim();
  if (env && !isLoopbackUrl(env.replace(/^ws/i, "http"))) {
    if (typeof window !== "undefined") {
      try {
        const u = new URL(env.replace(/^ws/i, "http"));
        if (isPrivateHostname(u.hostname) && u.hostname !== window.location.hostname) {
          return sameOriginWs();
        }
      } catch {
        /* ignore */
      }
    }
    return env.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return sameOriginWs();
  }
  return "ws://127.0.0.1:8000";
}

export const WS_URL = typeof window !== "undefined" ? "" : process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function isAuthError(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 401;
  const msg = String(err).toLowerCase();
  return msg.includes("not authenticated") || msg.includes("unauthorized") || msg.includes("401");
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (refreshInFlight) return refreshInFlight;
  const { setStoredToken, clearStoredToken } = await import("@/lib/auth");
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        clearStoredToken();
        return false;
      }
      const data = (await res.json()) as { access_token?: string };
      if (data.access_token) setStoredToken(data.access_token);
      return true;
    } catch {
      clearStoredToken();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function authHeaders(explicit?: string | null): Promise<HeadersInit> {
  const headers: Record<string, string> = {};
  if (explicit) {
    headers.Authorization = `Bearer ${explicit}`;
    return headers;
  }
  if (typeof window !== "undefined") {
    const { getStoredToken } = await import("@/lib/auth");
    const stored = getStoredToken();
    if (stored) headers.Authorization = `Bearer ${stored}`;
  }
  return headers;
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const doFetch = async () => {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(await authHeaders(token)),
      ...(options.headers || {}),
    };
    return fetch(`${getApiUrl()}${path}`, {
      ...options,
      credentials: "include",
      headers,
    });
  };

  let res = await doFetch();
  if (res.status === 401 && !path.includes("/auth/login") && !path.includes("/auth/refresh")) {
    const refreshed = await tryRefreshSession();
    if (refreshed) res = await doFetch();
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    const message =
      typeof detail === "string" ? detail : Array.isArray(detail) ? detail[0]?.msg : res.statusText;
    throw new ApiError(message || res.statusText || "Request failed", res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function downloadBlob(path: string): Promise<Blob> {
  const { getStoredToken } = await import("@/lib/auth");
  const headers: HeadersInit = {};
  const stored = getStoredToken();
  if (stored) (headers as Record<string, string>)["Authorization"] = `Bearer ${stored}`;
  let res = await fetch(`${getApiUrl()}${path}`, { credentials: "include", headers });
  if (res.status === 401) {
    const ok = await tryRefreshSession();
    if (ok) {
      const token = getStoredToken();
      const h: HeadersInit = {};
      if (token) (h as Record<string, string>)["Authorization"] = `Bearer ${token}`;
      res = await fetch(`${getApiUrl()}${path}`, { credentials: "include", headers: h });
    }
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(err.detail || res.statusText || "Download failed", res.status);
  }
  return res.blob();
}

export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const { getStoredToken } = await import("@/lib/auth");
  const form = new FormData();
  form.append("file", file);
  const headers: HeadersInit = {};
  const stored = getStoredToken();
  if (stored) (headers as Record<string, string>)["Authorization"] = `Bearer ${stored}`;
  let res = await fetch(`${getApiUrl()}${path}`, {
    method: "POST",
    credentials: "include",
    headers,
    body: form,
  });
  if (res.status === 401) {
    const ok = await tryRefreshSession();
    if (ok) {
      const token = getStoredToken();
      const h: HeadersInit = {};
      if (token) (h as Record<string, string>)["Authorization"] = `Bearer ${token}`;
      res = await fetch(`${getApiUrl()}${path}`, { method: "POST", credentials: "include", headers: h, body: form });
    }
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(err.detail || res.statusText || "Upload failed", res.status);
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

