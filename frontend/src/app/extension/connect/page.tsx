"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getOAuthApiUrl } from "@/lib/api";

export default function ExtensionConnectPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [extPresent, setExtPresent] = useState(false);
  const apiDirect = getOAuthApiUrl();
  const webBase = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  useEffect(() => {
    api<{ access_token: string }>("/api/v1/auth/extension-token")
      .then((d) => setToken(d.access_token))
      .catch(() => router.replace("/login?next=/extension/connect"));
  }, [router]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== window) return;
      const data = event.data;
      if (data?.type === "resonance-extension-present") {
        setExtPresent(true);
      }
      if (data?.type === "resonance-extension-auth-result") {
        if (data.ok) {
          setMsg("Connected — credentials saved in the extension. You can close this tab.");
        } else {
          setMsg(data.error || "Extension did not accept credentials. Use Copy + Options instead.");
        }
      }
    }
    window.addEventListener("message", onMessage);
    // Re-announce request in case bridge loaded first
    window.postMessage({ type: "resonance-extension-ping" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setMsg(`${label} copied to clipboard. Paste into extension options.`);
  }

  function sendToExtension() {
    if (!token) return;
    setMsg("Sending to extension…");
    window.postMessage(
      {
        type: "resonance-extension-auth",
        apiBase: apiDirect,
        webBase,
        accessToken: token,
      },
      "*"
    );
    // If bridge never replies
    setTimeout(() => {
      setMsg((m) =>
        m === "Sending to extension…"
          ? "No extension response — reload the unpacked extension, then try again (or copy the token manually)."
          : m
      );
    }, 1500);
  }

  return (
    <div className="min-h-screen bg-surface p-8 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-2">Connect Chrome extension</h1>
      <p className="text-sm text-muted mb-6">
        Extension tokens last 30 days. Prefer <strong className="text-white">Send to extension</strong> so the API URL
        and token are saved automatically.
      </p>

      {extPresent ? (
        <p className="text-sm text-spotify mb-4">Extension detected on this browser.</p>
      ) : (
        <p className="text-sm text-amber-300 mb-4">
          Extension not detected. Load/reload it from chrome://extensions, then refresh this page.
        </p>
      )}

      <button
        type="button"
        disabled={!token}
        onClick={sendToExtension}
        className="w-full bg-spotify text-black font-semibold py-3 rounded-full mb-6 disabled:opacity-40"
      >
        Send to extension
      </button>

      <details className="text-sm mb-6">
        <summary className="cursor-pointer text-muted hover:text-white">Manual copy instead</summary>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-muted mb-1">API base URL (FastAPI, usually port 8000)</label>
            <div className="flex gap-2">
              <input readOnly value={apiDirect} className="flex-1 bg-panel rounded px-3 py-2 text-sm" />
              <button
                type="button"
                onClick={() => copy(apiDirect, "API URL")}
                className="bg-white/10 px-3 rounded-full text-sm"
              >
                Copy
              </button>
            </div>
          </div>
          <div>
            <label className="block text-muted mb-1">Web app URL</label>
            <div className="flex gap-2">
              <input readOnly value={webBase} className="flex-1 bg-panel rounded px-3 py-2 text-sm" />
              <button
                type="button"
                onClick={() => copy(webBase, "Web URL")}
                className="bg-white/10 px-3 rounded-full text-sm"
              >
                Copy
              </button>
            </div>
          </div>
          <div>
            <label className="block text-muted mb-1">Access token (JWT)</label>
            <div className="flex gap-2">
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
                className="bg-white/10 px-3 rounded-full text-sm disabled:opacity-40"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </details>

      {msg && <p className="text-sm text-spotify mb-4">{msg}</p>}

      <ol className="text-sm text-muted list-decimal list-inside space-y-2 mb-6">
        <li>
          <Link href="/profile" className="text-spotify underline">
            Download &amp; load
          </Link>{" "}
          the extension (or Reload on chrome://extensions after updates).
        </li>
        <li>Click <strong className="text-white">Send to extension</strong> above.</li>
        <li>On YouTube, open Save to Resonance — your playlists should appear in Destination.</li>
      </ol>

      <Link href="/setup-guide" className="text-spotify underline text-sm">
        Full setup guide
      </Link>
    </div>
  );
}
