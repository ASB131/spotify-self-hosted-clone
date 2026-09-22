"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

function wsBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_WS_URL;
  if (env && env.trim()) return env.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    // Prefer direct API host for websockets (Next proxy may not upgrade WS)
    const direct = process.env.NEXT_PUBLIC_API_DIRECT_URL || "http://localhost:8000";
    try {
      const u = new URL(direct);
      return `${u.protocol === "https:" ? "wss:" : "ws:"}//${u.host}`;
    } catch {
      return `${proto}//${window.location.hostname}:8000`;
    }
  }
  return "ws://localhost:8000";
}

export function useWebSocket(onEvent: (event: string, data: Record<string, unknown>) => void) {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      const token = typeof window !== "undefined" ? sessionStorage.getItem("access_token") : null;
      const base = wsBaseUrl();
      const url = token ? `${base}/api/v1/ws?token=${encodeURIComponent(token)}` : `${base}/api/v1/ws`;
      ws = new WebSocket(url);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) {
          retryTimer = setTimeout(connect, 3000);
        }
      };
      ws.onerror = () => {
        // onclose will fire after error
      };
      ws.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data);
          onEventRef.current(parsed.event, parsed.data);
        } catch {
          /* ignore */
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  return connected;
}

export function WebSocketBridge({ onRefresh }: { onRefresh: () => void }) {
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  useWebSocket((event) => {
    if (
      ["download_complete", "download_failed", "download_progress", "spotify_sync", "upgrade_complete"].includes(
        event,
      )
    ) {
      refreshRef.current();
    }
  });
  return null;
}

export async function checkSetup(): Promise<boolean> {
  const data = await api<{ needs_setup: boolean }>("/api/v1/auth/setup-status");
  return data.needs_setup;
}
