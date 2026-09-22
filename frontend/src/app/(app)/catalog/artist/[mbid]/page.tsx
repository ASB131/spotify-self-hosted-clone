"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Catalog downloads removed — library search / YouTube extension only. */
export default function CatalogArtistPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/search");
  }, [router]);
  return <p className="text-sm text-muted">Catalog browsing removed. Redirecting to search…</p>;
}
