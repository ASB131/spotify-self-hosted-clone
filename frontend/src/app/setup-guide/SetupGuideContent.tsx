"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { API_URL, api } from "@/lib/api";

type ServerSetup = {
  needs_setup: boolean;
  spotify_server_configured: boolean;
  youtube_cookies_ready: boolean;
  spotify_redirect_uri: string;
  public_web_url: string;
};

type Checklist = {
  spotify_server_configured: boolean;
  spotify_account_linked: boolean;
  spotify_redirect_uri: string;
  extension_cors_hint: string;
};

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${ok ? "bg-spotify/20 text-spotify" : "bg-red-500/20 text-red-300"}`}>
      {ok ? "OK" : "Needs setup"} — {label}
    </span>
  );
}

export default function SetupGuideContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [server, setServer] = useState<ServerSetup | null>(null);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [adminHints, setAdminHints] = useState<Record<string, unknown> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`${API_URL}/api/v1/setup/server`)
      .then((r) => r.json())
      .then(setServer)
      .catch(() => setMsg("Could not load server status. Is the API running?"));

    api<Checklist>("/api/v1/setup/checklist")
      .then(setChecklist)
      .catch(() => router.push("/login"));

    api<Record<string, unknown>>("/api/v1/admin/server-setup")
      .then(setAdminHints)
      .catch(() => setAdminHints(null));
  }, [router]);

  useEffect(() => {
    load();
  }, [load, searchParams]);

  async function copyApiUrl() {
    await navigator.clipboard.writeText(API_URL);
    setMsg("API URL copied.");
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-bold mb-2">Setup guide</h1>
      <p className="text-muted text-sm mb-6 max-w-2xl">
        Step-by-step configuration for downloads, the Chrome extension, and Spotify library sync. Server-level options
        are set in your <code className="text-white">.env</code> file (Docker host).
      </p>

      {msg && <p className="text-sm text-spotify mb-4">{msg}</p>}

      {server && (
        <section className="mb-8 space-y-2">
          <h2 className="text-lg font-semibold">Server status</h2>
          <div className="flex flex-wrap gap-2">
            <StatusBadge ok={!server.needs_setup} label="Admin account" />
            <StatusBadge ok={server.youtube_cookies_ready} label="YouTube cookies.txt" />
            <StatusBadge ok={server.spotify_server_configured} label="Spotify API keys" />
          </div>
        </section>
      )}

      <section className="mb-8 max-w-2xl space-y-3 bg-panel p-5 rounded-lg">
        <h2 className="text-lg font-semibold">1. YouTube downloads (server)</h2>
        <p className="text-sm text-muted">
          Export YouTube cookies from your browser (extension such as &quot;Get cookies.txt LOCALLY&quot;), save as{" "}
          <code className="text-white">cookies.txt</code> next to docker-compose, and restart the worker/API containers.
        </p>
        {server && !server.youtube_cookies_ready && (
          <p className="text-sm text-amber-200/90">Your server reports cookies are missing or empty.</p>
        )}
      </section>

      <section className="mb-8 max-w-2xl space-y-3 bg-panel p-5 rounded-lg">
        <h2 className="text-lg font-semibold">2. Chrome extension</h2>
        <ol className="text-sm text-muted list-decimal list-inside space-y-2">
          <li>
            Open{" "}
            <Link href="/extension/connect" className="text-spotify underline">
              Extension connect
            </Link>{" "}
            — copy API URL and token with one click.
          </li>
          <li>
            <Link href="/profile" className="text-spotify underline">
              Profile
            </Link>{" "}
            → download the extension zip and load it in <code className="text-white">chrome://extensions</code>.
          </li>
          <li>Paste into extension options (or use &quot;Open Extension connect&quot; from options).</li>
          <li>{checklist?.extension_cors_hint}</li>
        </ol>
        <button type="button" onClick={copyApiUrl} className="text-sm bg-white/10 px-3 py-1.5 rounded-full">
          Copy API URL ({API_URL})
        </button>
      </section>

      <section className="mb-8 max-w-2xl space-y-3 bg-panel p-5 rounded-lg">
        <h2 className="text-lg font-semibold">3. Spotify liked-songs sync</h2>
        {!server?.spotify_server_configured ? (
          <>
            <p className="text-sm text-muted">
              An admin must add Spotify credentials to <code className="text-white">.env</code> on the server:
            </p>
            <ul className="text-sm text-muted list-disc list-inside">
              <li>
                <code className="text-white">SPOTIFY_CLIENT_ID</code> /{" "}
                <code className="text-white">SPOTIFY_CLIENT_SECRET</code> from{" "}
                <a className="text-spotify underline" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
                  Spotify Developer Dashboard
                </a>
              </li>
              <li>
                Redirect URI in Spotify app:{" "}
                <code className="text-white">{server?.spotify_redirect_uri ?? "http://localhost:8000/api/v1/spotify/callback"}</code>
              </li>
              <li>
                <code className="text-white">PUBLIC_WEB_URL</code> = your web UI (e.g. http://localhost:3000)
              </li>
            </ul>
            {adminHints && (
              <pre className="text-xs bg-black/40 p-3 rounded overflow-x-auto max-h-48 overflow-y-auto">
                {JSON.stringify(adminHints, null, 2)}
              </pre>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted">Spotify API keys are configured. Link your Spotify account:</p>
            {checklist && (
              <p className="text-sm">
                {checklist.spotify_account_linked ? (
                  <span className="text-spotify">Your account is linked.</span>
                ) : (
                  <span className="text-amber-200/90">Not linked yet.</span>
                )}
              </p>
            )}
            <a
              href={`${API_URL}/api/v1/spotify/connect`}
              className="inline-block bg-spotify text-black px-4 py-2 rounded-full font-semibold text-sm"
            >
              Connect my Spotify account
            </a>
          </>
        )}
      </section>

      <section className="max-w-2xl space-y-2 bg-panel p-5 rounded-lg">
        <h2 className="text-lg font-semibold">4. Users &amp; invites</h2>
        <p className="text-sm text-muted">
          Create invite codes under <Link href="/admin" className="text-spotify underline">Admin</Link>.
        </p>
      </section>
    </AppShell>
  );
}
