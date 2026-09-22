"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/AppShell";

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <AppShell>
      <div key={pathname} className="page-enter min-h-full">
        {children}
      </div>
    </AppShell>
  );
}
