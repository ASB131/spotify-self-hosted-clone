"use client";

import { useEffect, useState } from "react";
import { API_URL, WS_URL, api } from "@/lib/api";

export function useWebSocket(onEvent: (event: string, data: Record<string, unknown>) => void) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = typeof window !== "undefined" ? sessionStorage.getItem("access_token") : null;
    const url = token ? `${WS_URL}/api/v1/ws?token=${encodeURIComponent(token)}` : `${WS_URL}/api/v1/ws`;
    const ws = new WebSocket(url);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data);
        onEvent(parsed.event, parsed.data);
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, [onEvent]);

  return connected;
}

export function WebSocketBridge({ onRefresh }: { onRefresh: () => void }) {
  useWebSocket((event) => {
    if (
      ["download_complete", "download_failed", "download_progress", "spotify_sync", "upgrade_complete"].includes(
        event,
      )
    ) {
      onRefresh();
    }
  });
  return null;
}

export async function checkSetup(): Promise<boolean> {
  const data = await api<{ needs_setup: boolean }>("/api/v1/auth/setup-status");
  return data.needs_setup;
}
