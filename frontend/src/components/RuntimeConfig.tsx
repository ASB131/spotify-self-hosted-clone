"use client";

import { useEffect } from "react";

function isPrivateHostname(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i.test(
    host
  );
}

/**
 * Loads server-side URL overrides into window so client code can reach the API/WS
 * without baking localhost into the Docker image.
 */
export function RuntimeConfig() {
  useEffect(() => {
    let cancelled = false;
    fetch("/api/runtime-config")
      .then((r) => r.json())
      .then((cfg: { api_direct?: string; ws_url?: string }) => {
        if (cancelled) return;
        const w = window as unknown as {
          __RESONANCE_API_DIRECT__?: string;
          __RESONANCE_WS__?: string;
        };
        if (cfg.api_direct) w.__RESONANCE_API_DIRECT__ = cfg.api_direct;

        const candidate = (cfg.ws_url || (cfg.api_direct ? cfg.api_direct.replace(/^http/i, "ws") : "")).replace(
          /\/$/,
          ""
        );
        if (!candidate) return;
        try {
          const u = new URL(candidate.replace(/^ws/i, "http"));
          // Don't set unreachable private WS when browsing from a public hostname.
          if (isPrivateHostname(u.hostname) && u.hostname !== window.location.hostname) {
            window.dispatchEvent(new Event("resonance-runtime-ready"));
            return;
          }
          w.__RESONANCE_WS__ = candidate;
        } catch {
          /* ignore */
        }
        window.dispatchEvent(new Event("resonance-runtime-ready"));
      })
      .catch(() => {
        window.dispatchEvent(new Event("resonance-runtime-ready"));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
