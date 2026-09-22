"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, downloadBlob } from "@/lib/api";

type ServerSetup = {
  needs_setup: boolean;
  youtube_cookies_ready: boolean;
  public_web_url: string;
};

type Checklist = {
  youtube_cookies_ready: boolean;
  extension_cors_hint: string;
};

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full ${ok ? "bg-spotify/20 text-spotify" : "bg-red-500/20 text-red-300"}`}
    >
      {ok ? "OK" : "Todo"} · {label}
    </span>
  );
}

export default function SetupGuideContent() {
  const [server, setServer] = useState<ServerSetup | null>(null);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    api<ServerSetup>("/api/v1/setup/server").then(setServer).catch(() => setServer(null));
    api<Checklist>("/api/v1/setup/checklist").then(setChecklist).catch(() => setChecklist(null));
  };

  useEffect(() => {
    load();
  }, []);

  async function installChromeExtension() {
    setMsg(null);
    try {
      const blob = await downloadBlob("/api/v1/extension/download");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "resonance-chrome-extension.zip";
      a.click();
      URL.revokeObjectURL(url);
      window.open("/extension/install", "_blank", "noopener,noreferrer");
      setMsg("Extension downloaded. Open Extension connect to copy your token.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not download extension");
    }
  }

  return (
    <div className="max-w-2xl pb-12">
      <h1 className="text-3xl font-bold mb-2">Setup guide</h1>
      <p className="text-muted text-sm mb-6">
        Resonance is YouTube-only: save tracks with the Chrome extension button on YouTube watch pages.
      </p>

      {msg && <p className="text-sm text-spotify mb-4">{msg}</p>}

      <section className="mb-8 bg-panel p-4 rounded-lg space-y-2">
        <h2 className="text-lg font-semibold">Status</h2>
        <div className="flex flex-wrap gap-2">
          <StatusBadge ok={!!server?.youtube_cookies_ready} label="YouTube cookies" />
        </div>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-lg font-semibold">1. Chrome extension (required)</h2>
        <p className="text-sm text-muted">
          This is the only way to add music. Download the extension, load it unpacked in Chrome, then connect with your
          API token.
        </p>
        <ol className="list-decimal pl-5 text-sm text-muted space-y-2">
          <li>
            <button type="button" onClick={installChromeExtension} className="text-spotify underline">
              Download the extension
            </button>{" "}
            (or from{" "}
            <Link href="/profile" className="text-spotify underline">
              Profile
            </Link>
            ).
          </li>
          <li>
            Open{" "}
            <Link href="/extension/install" className="text-spotify underline">
              Install instructions
            </Link>
            .
          </li>
          <li>
            Use{" "}
            <Link href="/extension/connect" className="text-spotify underline">
              Extension connect
            </Link>{" "}
            to copy API URL + token into the extension options.
          </li>
          <li>On any YouTube video page, click <strong>Save to Resonance</strong>.</li>
        </ol>
        {checklist?.extension_cors_hint && (
          <p className="text-xs text-muted mt-2">{checklist.extension_cors_hint}</p>
        )}
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-lg font-semibold">2. YouTube cookies (optional, admin)</h2>
        <p className="text-sm text-muted">
          If downloads fail on age-restricted videos, an admin can upload a{" "}
          <code className="text-white">cookies.txt</code> under{" "}
          <Link href="/admin" className="text-spotify underline">
            Admin → Integrations
          </Link>
          .
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">3. Invites</h2>
        <p className="text-sm text-muted">
          Create invite codes under{" "}
          <Link href="/admin" className="text-spotify underline">
            Admin
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
