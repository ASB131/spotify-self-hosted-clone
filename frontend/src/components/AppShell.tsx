"use client";

import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { AudioPlayerBar } from "@/components/AudioPlayerBar";
import { QueuePanel } from "@/components/QueuePanel";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen bg-black text-white flex flex-col p-2 gap-2 overflow-hidden">
      <div className="flex flex-1 min-h-0 gap-2">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col rounded-lg bg-surface overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-auto px-6 pb-4">{children}</main>
        </div>
      </div>
      <AudioPlayerBar />
      <QueuePanel />
    </div>
  );
}
