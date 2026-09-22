"use client";

import { useEffect, useState } from "react";
import { api, uploadFile } from "@/lib/api";

type CookiesStatus = {
  configured: boolean;
  source: string | null;
  hint: string;
};

export function AdminIntegrations() {
  const [cookies, setCookies] = useState<CookiesStatus | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    api<CookiesStatus>("/api/v1/admin/youtube/cookies").then(setCookies).catch(() => setCookies(null));
  };

  useEffect(() => {
    load();
  }, []);

  async function onCookiesSelected(file: File | null) {
    if (!file) return;
    setMsg(null);
    try {
      const status = await uploadFile<CookiesStatus>("/api/v1/admin/youtube/cookies", file);
      setCookies(status);
      setMsg(status.hint);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Cookie upload failed");
    }
  }

  async function clearCookies() {
    setMsg(null);
    try {
      const status = await api<CookiesStatus>("/api/v1/admin/youtube/cookies", { method: "DELETE" });
      setCookies(status);
      setMsg(status.hint);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Clear failed");
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">Integrations</h2>
        <p className="text-sm text-muted">
          Music is added only via the YouTube Chrome extension. Optional cookies help yt-dlp with age-restricted or
          region-locked videos.
        </p>
      </div>

      {msg && <p className="text-sm text-spotify">{msg}</p>}

      <section className="bg-panel p-4 rounded-lg space-y-3">
        <h3 className="font-semibold">YouTube cookies</h3>
        {cookies ? (
          <p className={`text-xs ${cookies.configured ? "text-spotify" : "text-muted"}`}>
            Status: {cookies.configured ? `OK (${cookies.source})` : "No cookies — OK for most tracks"}
          </p>
        ) : (
          <p className="text-xs text-muted">Loading…</p>
        )}
        {cookies?.hint && <p className="text-xs text-muted">{cookies.hint}</p>}
        <label className="block text-sm">
          Upload cookies.txt (optional)
          <input
            type="file"
            accept=".txt,text/plain"
            className="mt-1 block w-full text-sm"
            onChange={(e) => onCookiesSelected(e.target.files?.[0] ?? null)}
          />
        </label>
        {cookies?.configured && cookies.source === "uploaded" && (
          <button type="button" onClick={clearCookies} className="text-xs text-red-400 underline">
            Remove uploaded cookies
          </button>
        )}
      </section>
    </div>
  );
}
