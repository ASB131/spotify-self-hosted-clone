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
      if (data?.type === "resonance-extension-present" || data?.type === "media-player-extension-present") {
        setExtPresent(true);
      }
      if (data?.type === "resonance-extension-auth-result" || data?.type === "media-player-extension-auth-result") {
        if (data.ok) {
          setMsg("Connected. Credentials saved in the extension.");
        } else {
          setMsg(data.error || "Extension did not accept credentials. Use copy instead.");
        }
      }
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ type: "resonance-extension-ping" }, "*");
    window.postMessage({ type: "media-player-extension-ping" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(`${label} copied.`);
    } catch {
      setMsg("Clipboard blocked on this page. Select and copy manually.");
    }
  }

  function sendToExtension() {
    if (!token) return;
    setMsg("Sending to extension…");
    const payload = { apiBase: apiDirect, webBase, accessToken: token };
    window.postMessage({ type: "resonance-extension-auth", ...payload }, "*");
    window.postMessage({ type: "media-player-extension-auth", ...payload }, "*");
    setTimeout(() => {
      setMsg((m) =>
        m === "Sending to extension…"
          ? "No extension response. Reload the unpacked extension, then try again."
          : m
      );
    }, 1500);
  }

  return (
    <div className="max-w-lg pb-10">
      <h1 className="text-2xl font-bold mb-1">Connect Chrome extension</h1>
      <p className="text-sm text-muted mb-6">
        Tokens last 30 days. Prefer Send to extension so the API URL and token are saved automatically.
      </p>

      <div
        className={`mb-4 rounded-lg px-3 py-2 text-sm ${
          extPresent ? "bg-spotify/15 text-spotify" : "bg-amber-500/10 text-amber-200"
        }`}
      >
        {extPresent
          ? "Extension detected on this browser."
          : "Extension not detected. Load it from chrome://extensions, then refresh."}
      </div>

      <button
        type="button"
        disabled={!token}
        onClick={sendToExtension}
        className="w-full bg-spotify text-black font-semibold py-3 rounded-full mb-4 disabled:opacity-40"
      >
        Send to extension
      </button>

      {msg && <p className="text-sm text-spotify mb-4">{msg}</p>}

      <details className="bg-panel rounded-lg p-4 text-sm mb-6 border border-white/5">
        <summary className="cursor-pointer text-muted hover:text-white font-medium">Manual copy</summary>
        <div className="mt-4 space-y-3">
          <Field label="API URL" value={apiDirect} onCopy={() => copy(apiDirect, "API URL")} />
          <Field label="Web URL" value={webBase} onCopy={() => copy(webBase, "Web URL")} />
          <Field
            label="Token"
            value={token ?? "Loading…"}
            secret
            onCopy={() => token && copy(token, "Token")}
            disabled={!token}
          />
        </div>
      </details>

      <p className="text-sm text-muted">
        Download from{" "}
        <Link href="/profile" className="text-spotify underline">
          Profile
        </Link>
        , then on YouTube click <strong className="text-white">Save to Media player</strong>.
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onCopy,
  secret,
  disabled,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  secret?: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-muted mb-1 text-xs uppercase tracking-wide">{label}</label>
      <div className="flex gap-2">
        <input
          readOnly
          value={value}
          type={secret ? "password" : "text"}
          className="flex-1 bg-[#242424] rounded-md px-3 py-2 text-sm font-mono text-white outline-none"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={onCopy}
          className="bg-white/10 hover:bg-white/15 px-3 rounded-full text-sm disabled:opacity-40"
        >
          Copy
        </button>
      </div>
    </div>
  );
}
