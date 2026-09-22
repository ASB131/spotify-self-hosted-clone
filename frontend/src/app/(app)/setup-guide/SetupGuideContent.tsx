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

export default function SetupGuideContent() {
  const [server, setServer] = useState<ServerSetup | null>(null);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api<ServerSetup>("/api/v1/setup/server").then(setServer).catch(() => setServer(null));
    api<Checklist>("/api/v1/setup/checklist").then(setChecklist).catch(() => setChecklist(null));
  }, []);

  async function installChromeExtension() {
    setMsg(null);
    try {
      const blob = await downloadBlob("/api/v1/extension/download");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "media-player-chrome-extension.zip";
      a.click();
      URL.revokeObjectURL(url);
      window.open("/extension/install", "_blank", "noopener,noreferrer");
      setMsg("Extension downloaded.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not download extension");
    }
  }

  return (
    <div className="max-w-xl pb-12 space-y-8">
      <header>
        <h1 className="text-3xl font-bold mb-2">Setup guide</h1>
        <p className="text-muted text-sm">
          Media player is YouTube-only. Save tracks with the Chrome extension on watch pages.
        </p>
      </header>

      {msg && <p className="text-sm text-spotify">{msg}</p>}

      <section className="bg-panel rounded-lg p-5 border border-white/5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">1. Chrome extension</h2>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              server?.youtube_cookies_ready ? "bg-spotify/20 text-spotify" : "bg-white/10 text-muted"
            }`}
          >
            Cookies {server?.youtube_cookies_ready ? "ready" : "optional"}
          </span>
        </div>
        <ol className="list-decimal pl-5 text-sm text-muted space-y-2">
          <li>
            <button type="button" onClick={installChromeExtension} className="text-spotify underline">
              Download the extension
            </button>
          </li>
          <li>
            Follow{" "}
            <Link href="/extension/install" className="text-spotify underline">
              install steps
            </Link>
          </li>
          <li>
            <Link href="/extension/connect" className="text-spotify underline">
              Connect
            </Link>{" "}
            your API token
          </li>
          <li>
            On YouTube, click <strong className="text-white">Save to Media player</strong>
          </li>
        </ol>
        {checklist?.extension_cors_hint && (
          <p className="text-xs text-muted pt-1 border-t border-white/5">{checklist.extension_cors_hint}</p>
        )}
      </section>

      <section className="bg-panel rounded-lg p-5 border border-white/5 space-y-2">
        <h2 className="font-semibold">2. YouTube cookies (optional)</h2>
        <p className="text-sm text-muted">
          Helps with age-restricted videos. Admins upload{" "}
          <code className="text-white">cookies.txt</code> under{" "}
          <Link href="/admin" className="text-spotify underline">
            Admin
          </Link>
          .
        </p>
      </section>

      <section className="bg-panel rounded-lg p-5 border border-white/5 space-y-2">
        <h2 className="font-semibold">3. Invites</h2>
        <p className="text-sm text-muted">
          Create invite codes in{" "}
          <Link href="/admin" className="text-spotify underline">
            Admin
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
