"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Catalog downloads removed — YouTube extension only. */
export default function CatalogRecordingPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/search");
  }, [router]);
  return <p className="text-sm text-muted">Catalog downloads removed. Redirecting to search…</p>;
}
