"use client";

import { useEffect, useRef, useState } from "react";
import { getWsUrl } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";

type Handler = (event: string, data: Record<string, unknown>) => void;

/** One shared socket for the whole app — avoids reconnect storms from many WebSocketBridge mounts. */
let sharedWs: WebSocket | null = null;
let sharedHandlers = new Set<Handler>();
let sharedConnected = false;
let sharedListeners = new Set<(c: boolean) => void>();
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 4000;
let failCount = 0;
let intentionalClose = false;
/** After repeated failures or when WS is unavailable (public domain via Next proxy), stop retrying. */
let giveUp = false;

function notifyConnected(v: boolean) {
  sharedConnected = v;
  sharedListeners.forEach((fn) => fn(v));
}

function connectShared() {
  if (typeof window === "undefined") return;
  if (giveUp) return;
  if (sharedWs && (sharedWs.readyState === WebSocket.OPEN || sharedWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const base = getWsUrl();
  // Next.js cannot upgrade WebSockets; public domain with only LAN API → skip silently (REST polling).
  if (!base) {
    giveUp = true;
    notifyConnected(false);
    return;
  }

  intentionalClose = false;
  const token = getStoredToken();
  const url = token ? `${base}/api/v1/ws?token=${encodeURIComponent(token)}` : `${base}/api/v1/ws`;

  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch {
    scheduleRetry();
    return;
  }
  sharedWs = ws;

  ws.onopen = () => {
    failCount = 0;
    retryDelay = 4000;
    giveUp = false;
    notifyConnected(true);
  };

  ws.onclose = () => {
    notifyConnected(false);
    if (sharedWs === ws) sharedWs = null;
    if (!intentionalClose) scheduleRetry();
  };

  ws.onerror = () => {
    // onclose follows
  };

  ws.onmessage = (msg) => {
    try {
      const parsed = JSON.parse(msg.data);
      sharedHandlers.forEach((h) => h(parsed.event, parsed.data || {}));
    } catch {
      /* ignore */
    }
  };
}

function scheduleRetry() {
  if (retryTimer || giveUp) return;
  failCount += 1;
  if (failCount >= 3) {
    giveUp = true;
    return;
  }
  const wait = Math.min(retryDelay * Math.pow(2, failCount - 1), 30000);
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    if (sharedHandlers.size > 0 && !giveUp) connectShared();
  }, wait);
}

function subscribe(handler: Handler, onConn: (c: boolean) => void) {
  sharedHandlers.add(handler);
  sharedListeners.add(onConn);
  onConn(sharedConnected);
  if (!giveUp) connectShared();
  return () => {
    sharedHandlers.delete(handler);
    sharedListeners.delete(onConn);
    if (sharedHandlers.size === 0) {
      intentionalClose = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      sharedWs?.close();
      sharedWs = null;
      notifyConnected(false);
      retryDelay = 4000;
      failCount = 0;
      giveUp = false;
    }
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("resonance-runtime-ready", () => {
    // RuntimeConfig may set a reachable WS URL after first mount.
    giveUp = false;
    failCount = 0;
    if (sharedHandlers.size > 0) connectShared();
  });
}

export function useWebSocket(onEvent: (event: string, data: Record<string, unknown>) => void) {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const handler: Handler = (event, data) => onEventRef.current(event, data);
    return subscribe(handler, setConnected);
  }, []);

  return connected;
}

export function WebSocketBridge({ onRefresh }: { onRefresh: () => void }) {
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  useWebSocket((event) => {
    if (
      ["download_complete", "download_failed", "download_progress", "spotify_sync", "upgrade_complete"].includes(
        event
      )
    ) {
      refreshRef.current();
    }
  });
  return null;
}

export async function checkSetup(): Promise<boolean> {
  const { api } = await import("@/lib/api");
  const data = await api<{ needs_setup: boolean }>("/api/v1/auth/setup-status");
  return data.needs_setup;
}
