"use client";

import { useEffect } from "react";
import { usePlayerStore } from "@/store/player";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return !!el.closest("[contenteditable=true]");
}

/** Global playback shortcuts — mount once from AppShell. */
export function KeyboardShortcuts() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const store = usePlayerStore.getState();
      const meta = e.metaKey || e.ctrlKey;

      if (e.code === "Space") {
        e.preventDefault();
        store.toggle();
        return;
      }
      if (e.key === "ArrowLeft" && !meta) {
        e.preventDefault();
        store.seek(Math.max(0, store.progress - 5));
        return;
      }
      if (e.key === "ArrowRight" && !meta) {
        e.preventDefault();
        store.seek(store.progress + 5);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        store.setVolume(Math.min(1, store.volume + 0.05));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        store.setVolume(Math.max(0, store.volume - 0.05));
        return;
      }
      if (meta && e.key === "ArrowRight") {
        e.preventDefault();
        store.next();
        return;
      }
      if (meta && e.key === "ArrowLeft") {
        e.preventDefault();
        store.prev();
        return;
      }
      if (e.key === "/" || e.key === "?") {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(
          'header form input[placeholder*="play"], header form input[type="search"], header form input'
        );
        input?.focus();
        input?.select();
        return;
      }
      if (e.key === "q" || e.key === "Q") {
        e.preventDefault();
        store.toggleQueuePanel();
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
