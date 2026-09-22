"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { clearStoredToken } from "@/lib/auth";
import { fetchSetupStatus } from "@/lib/setup";

/**
 * Require a signed-in user for all authenticated app routes.
 * Redirects to /login (or /setup) instead of showing an empty shell.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const setup = await fetchSetupStatus();
        if (cancelled) return;
        if (setup.needs_setup) {
          router.replace("/setup");
          return;
        }
        await api("/api/v1/auth/me");
        if (!cancelled) setReady(true);
      } catch {
        if (cancelled) return;
        clearStoredToken();
        const next =
          typeof window !== "undefined" && window.location.pathname && window.location.pathname !== "/"
            ? `?next=${encodeURIComponent(window.location.pathname + window.location.search)}`
            : "";
        router.replace(`/login${next}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-muted text-sm">Checking session…</div>
    );
  }
  return <>{children}</>;
}
