"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { AudioPlayerBar } from "@/components/AudioPlayerBar";
import { QueuePanel } from "@/components/QueuePanel";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";

export function AppShell({ children }: { children: ReactNode }) {
  const [libraryOpen, setLibraryOpen] = useState(false);

  return (
    <div className="h-screen bg-black text-white flex flex-col overflow-hidden">
      <KeyboardShortcuts />
      <TopBar onOpenLibrary={() => setLibraryOpen(true)} />
      <div className="flex flex-1 min-h-0 gap-2 px-2 pb-2 relative">
        {/* Desktop sidebar */}
        <div className="hidden md:flex shrink-0">
          <Sidebar />
        </div>

        {/* Mobile library sheet */}
        {libraryOpen && (
          <div className="md:hidden fixed inset-0 z-[140] flex">
            <button
              type="button"
              className="absolute inset-0 bg-black/60"
              aria-label="Close library"
              onClick={() => setLibraryOpen(false)}
            />
            <div className="relative h-full w-[min(100%,320px)] shadow-2xl">
              <Sidebar onNavigate={() => setLibraryOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col rounded-lg bg-surface overflow-hidden">
          <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 pb-4 pt-4 min-w-0 max-w-full">
            <div className="min-w-0 max-w-full">{children}</div>
          </main>
        </div>
      </div>
      <AudioPlayerBar />
      <QueuePanel />
    </div>
  );
}
