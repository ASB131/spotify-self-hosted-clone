"use client";

import { useEffect } from "react";

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
        if (cfg.ws_url) {
          w.__RESONANCE_WS__ = cfg.ws_url;
        } else if (cfg.api_direct) {
          // Derive WS from API direct — Next.js cannot proxy WebSocket upgrades.
          w.__RESONANCE_WS__ = cfg.api_direct.replace(/^http/i, "ws").replace(/\/$/, "");
        }
      })
      .catch(() => {
        /* optional */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
