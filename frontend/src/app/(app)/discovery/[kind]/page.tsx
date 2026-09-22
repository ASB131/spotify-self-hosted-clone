"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Discovery Weekly / Release Radar removed — redirect home. */
export default function DiscoveryPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return <p className="text-sm text-muted">Discovery playlists were removed. Redirecting…</p>;
}
