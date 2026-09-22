"use client";

import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { AudioPlayerBar } from "@/components/AudioPlayerBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-auto p-6 pb-28">{children}</main>
      </div>
      <div className="fixed bottom-0 left-0 right-0">
        <AudioPlayerBar />
      </div>
    </div>
  );
}
