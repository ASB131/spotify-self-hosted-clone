"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <AppShell>
      <AuthGate>
        <div key={pathname} className="page-enter min-h-full">
          {children}
        </div>
      </AuthGate>
    </AppShell>
  );
}
