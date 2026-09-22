"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, getApiUrl, getOAuthApiUrl } from "@/lib/api";

type ServerSetup = {
  needs_setup: boolean;
  spotify_server_configured: boolean;
  youtube_cookies_ready: boolean;
  spotify_redirect_uri: string;
  public_web_url: string;
  lidarr_configured?: boolean;
  lidarr_reachable?: boolean;
  lidarr_hint?: string | null;
  listenbrainz_ok?: boolean;
  musicbrainz_ok?: boolean;
};

type Checklist = {
  spotify_server_configured: boolean;
  spotify_account_linked: boolean;
  spotify_redirect_uri: string;
  extension_cors_hint: string;
  lidarr_ready?: boolean;
  lidarr_hint?: string | null;
};

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full ${ok ? "bg-spotify/20 text-spotify" : "bg-red-500/20 text-red-300"}`}
    >
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
    fetch(`${getApiUrl()}/api/v1/setup/server`)
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
    await navigator.clipboard.writeText(getApiUrl());
    setMsg("API URL copied.");
  }

  return (
    <>
      <h1 className="text-2xl font-bold mb-2">Setup guide</h1>
      <p className="text-muted text-sm mb-6 max-w-2xl">
        Step-by-step configuration for downloads, Lidarr torrents, the Chrome extension, and Spotify.
        Server-level options live in <code className="text-white">.env</code> and Admin → Integrations.
      </p>

      {msg && <p className="text-sm text-spotify mb-4">{msg}</p>}

      {server && (
        <section className="mb-8 space-y-2">
          <h2 className="text-lg font-semibold">Server status</h2>
          <div className="flex flex-wrap gap-2">
            <StatusBadge ok={!server.needs_setup} label="Admin account" />
            <StatusBadge ok={server.youtube_cookies_ready} label="YouTube cookies.txt" />
            <StatusBadge ok={server.spotify_server_configured} label="Spotify API keys" />
            <StatusBadge ok={!!server.musicbrainz_ok} label="MusicBrainz" />
            <StatusBadge ok={!!server.listenbrainz_ok} label="ListenBrainz" />
            <StatusBadge ok={!!server.lidarr_reachable} label="Lidarr reachable" />
          </div>
          {server.lidarr_hint && <p className="text-sm text-muted mt-2">{server.lidarr_hint}</p>}
        </section>
      )}

      <section className="mb-8 max-w-2xl space-y-3 bg-panel p-5 rounded-lg">
        <h2 className="text-lg font-semibold">1. Lidarr + your qBittorrent (recommended for Discovery)</h2>
        <p className="text-sm text-muted">
          YouTube search often grabs mixes. For Discover Weekly / Release Radar / catalog downloads, use{" "}
          <strong className="text-white">Lidarr over BitTorrent</strong>. Lidarr is a separate app (
          <a
            href="https://github.com/Lidarr/Lidarr"
            className="text-spotify underline"
            target="_blank"
            rel="noreferrer"
          >
            Lidarr/Lidarr
          </a>
          ) — it cannot be built into Resonance.{" "}
          <strong className="text-white">qBittorrent is not bundled</strong>; connect the client you already run.
        </p>
        <ol className="text-sm text-muted list-decimal list-inside space-y-2">
          <li>
            Optional: start Lidarr in this stack with{" "}
            <code className="text-white">docker compose --profile arr up -d</code> (or use a Lidarr you already host).
          </li>
          <li>
            Open Lidarr (default{" "}
            <a href="http://localhost:8686" className="text-spotify underline" target="_blank" rel="noreferrer">
              http://localhost:8686
            </a>
            ).
          </li>
          <li>
            Media Management → root folder <code className="text-white">/music</code> (must be the same library volume
            as Resonance <code className="text-white">MUSIC_VOLUME</code>).
          </li>
          <li>
            Settings → Download Clients → add <strong className="text-white">qBittorrent</strong> pointing at your
            existing instance: host <code className="text-white">host.docker.internal</code> (or your server LAN IP),
            your WebUI port, username/password, category <code className="text-white">lidarr</code>. Use BitTorrent
            only — skip Usenet unless you want it.
          </li>
          <li>If paths differ between Lidarr and qBittorrent, set a Remote Path Mapping in Lidarr.</li>
          <li>Settings → Indexers: add torrent indexers (or connect Prowlarr).</li>
          <li>
            Copy Lidarr API key (Settings → General). In{" "}
            <Link href="/admin" className="text-spotify underline">
              Admin → Integrations
            </Link>{" "}
            set base URL to <code className="text-white">http://lidarr:8686</code> (when Lidarr is in this compose
            network) and paste the key.
          </li>
        </ol>
        {checklist?.lidarr_ready ? (
          <p className="text-sm text-spotify">Lidarr looks ready (reachable + root folder + download client).</p>
        ) : (
          <p className="text-sm text-amber-200/90">{checklist?.lidarr_hint || "Lidarr not fully ready yet."}</p>
        )}
      </section>

      <section className="mb-8 max-w-2xl space-y-3 bg-panel p-5 rounded-lg">
        <h2 className="text-lg font-semibold">2. YouTube downloads (server)</h2>
        <p className="text-sm text-muted">
          Still used for the Chrome extension and when Lidarr is off. Export YouTube cookies (e.g. &quot;Get cookies.txt
          LOCALLY&quot;), save as <code className="text-white">cookies.txt</code> next to docker-compose, restart
          worker/API.
        </p>
        {server && !server.youtube_cookies_ready && (
          <p className="text-sm text-amber-200/90">Your server reports cookies are missing or empty.</p>
        )}
      </section>

      <section className="mb-8 max-w-2xl space-y-3 bg-panel p-5 rounded-lg">
        <h2 className="text-lg font-semibold">3. Chrome extension</h2>
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
          <li>
            Click <strong className="text-white">Reload</strong> on chrome://extensions after updating the zip.
          </li>
        </ol>
        <button type="button" onClick={copyApiUrl} className="text-sm bg-white/10 px-3 py-1.5 rounded-full">
          Copy API URL ({getApiUrl()})
        </button>
      </section>

      <section className="mb-8 max-w-2xl space-y-3 bg-panel p-5 rounded-lg">
        <h2 className="text-lg font-semibold">4. Spotify liked-songs sync</h2>
        {!server?.spotify_server_configured ? (
          <>
            <p className="text-sm text-muted">
              An admin should open{" "}
              <Link href="/admin" className="text-spotify underline">
                Admin → Integrations
              </Link>{" "}
              and paste Spotify Client ID, Client secret, and redirect URI.
            </p>
            <p className="text-xs text-muted">
              In Spotify Dashboard use redirect URI:{" "}
              <code className="text-white">{server?.spotify_redirect_uri}</code>
            </p>
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
              href={`${getOAuthApiUrl()}/api/v1/spotify/connect`}
              className="inline-block bg-spotify text-black px-4 py-2 rounded-full font-semibold text-sm"
            >
              Connect my Spotify account
            </a>
          </>
        )}
      </section>

      <section className="max-w-2xl space-y-2 bg-panel p-5 rounded-lg">
        <h2 className="text-lg font-semibold">5. Users &amp; invites</h2>
        <p className="text-sm text-muted">
          Create invite codes under{" "}
          <Link href="/admin" className="text-spotify underline">
            Admin
          </Link>
          .
        </p>
        {adminHints && (
          <p className="text-xs text-muted">Admin hint: {String(adminHints.configure_in_ui || "")}</p>
        )}
      </section>
    </>
  );
}
