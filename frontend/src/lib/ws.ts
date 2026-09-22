"use client";

import { useEffect, useRef, useState } from "react";
import { api, getWsUrl } from "@/lib/api";

function wsBaseUrl(): string {
  return getWsUrl();
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
      ws.onopen = () => {
        setConnected(true);
        delay = 2000;
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) {
          retryTimer = setTimeout(connect, delay);
          delay = Math.min(delay * 2, 30000);
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

    let delay = 2000;
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
