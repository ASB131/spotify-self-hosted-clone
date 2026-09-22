"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getApiUrl } from "@/lib/api";

export default function ExtensionConnectPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api<{ access_token: string }>("/api/v1/auth/extension-token")
      .then((d) => setToken(d.access_token))
      .catch(() => router.replace("/login?next=/extension/connect"));
  }, [router]);

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setMsg(`${label} copied to clipboard. Paste into extension options.`);
  }

  return (
    <div className="min-h-screen bg-surface p-8 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-2">Connect Chrome extension</h1>
      <p className="text-sm text-muted mb-6">
        Paste these into the extension options page (puzzle icon → Resonance → Options). Tokens expire after{" "}
        {process.env.NEXT_PUBLIC_TOKEN_MINUTES ?? "30"} minutes — return here to refresh.
      </p>

      <label className="block text-sm text-muted mb-1">API base URL</label>
      <div className="flex gap-2 mb-4">
        <input readOnly value={getApiUrl()} className="flex-1 bg-panel rounded px-3 py-2 text-sm" />
        <button type="button" onClick={() => copy(getApiUrl(), "API URL")} className="bg-spotify text-black px-3 rounded-full text-sm font-semibold">
          Copy
        </button>
      </div>

      <label className="block text-sm text-muted mb-1">Access token (JWT)</label>
      <div className="flex gap-2 mb-4">
        <input
          readOnly
          value={token ?? "Loading…"}
          type="password"
          className="flex-1 bg-panel rounded px-3 py-2 text-sm font-mono"
        />
        <button
          type="button"
          disabled={!token}
          onClick={() => token && copy(token, "Token")}
          className="bg-spotify text-black px-3 rounded-full text-sm font-semibold disabled:opacity-40"
        >
          Copy
        </button>
      </div>

      {msg && <p className="text-sm text-spotify mb-4">{msg}</p>}

      <ol className="text-sm text-muted list-decimal list-inside space-y-2 mb-6">
        <li>
          <Link href="/profile" className="text-spotify underline">
            Download &amp; load
          </Link>{" "}
          the extension (or click Reload on chrome://extensions after updates).
        </li>
        <li>Paste API URL (<code className="text-white">http://localhost:8000</code>) and token into Options → Save.</li>
        <li>On YouTube, click Save to Resonance. Requests go through the extension background (not page CORS).</li>
      </ol>

      <Link href="/setup-guide" className="text-spotify underline text-sm">
        Full setup guide
      </Link>
    </div>
  );
}
