"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type SpotifyForm = {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  public_web_url: string;
  has_client_secret: boolean;
  configured: boolean;
  redirect_help: string;
};

type LidarrForm = {
  base_url: string;
  api_key: string;
  has_api_key: boolean;
  configured: boolean;
  note: string;
};

export function AdminIntegrations() {
  const [spotify, setSpotify] = useState<SpotifyForm | null>(null);
  const [lidarr, setLidarr] = useState<LidarrForm | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    api<SpotifyForm>("/api/v1/admin/integrations/spotify").then(setSpotify);
    api<LidarrForm>("/api/v1/admin/integrations/lidarr").then(setLidarr);
  };

  useEffect(() => {
    load();
  }, []);

  async function saveSpotify(e: React.FormEvent) {
    e.preventDefault();
    if (!spotify) return;
    setMsg(null);
    try {
      await api("/api/v1/admin/integrations/spotify", {
        method: "PUT",
        body: JSON.stringify({
          client_id: spotify.client_id,
          client_secret: spotify.client_secret || null,
          redirect_uri: spotify.redirect_uri,
          public_web_url: spotify.public_web_url,
        }),
      });
      setMsg("Spotify settings saved.");
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function saveLidarr(e: React.FormEvent) {
    e.preventDefault();
    if (!lidarr) return;
    setMsg(null);
    try {
      await api("/api/v1/admin/integrations/lidarr", {
        method: "PUT",
        body: JSON.stringify({
          base_url: lidarr.base_url,
          api_key: lidarr.api_key || null,
        }),
      });
      setMsg("Lidarr settings saved.");
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed");
    }
  }

  if (!spotify || !lidarr) return <p className="text-sm text-muted">Loading integrations…</p>;

  return (
    <section className="mb-8 max-w-xl space-y-6">
      <h3 className="font-semibold text-lg">Integrations</h3>
      {msg && <p className="text-sm text-spotify">{msg}</p>}

      <form onSubmit={saveSpotify} className="bg-panel p-4 rounded-lg space-y-3">
        <h4 className="font-medium">Spotify Developer app</h4>
        <p className="text-xs text-muted">{spotify.redirect_help}</p>
        <p className="text-xs text-amber-200/90">
          Paste the redirect URI below into Spotify Dashboard → your app → Redirect URIs. The &quot;not secure&quot; warning
          for <code className="text-white">http://localhost</code> is normal for local dev.
        </p>
        <label className="block text-sm">
          Client ID
          <input
            className="w-full mt-1 bg-black/30 rounded px-3 py-2"
            value={spotify.client_id}
            onChange={(e) => setSpotify({ ...spotify, client_id: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Client secret {spotify.has_client_secret && <span className="text-muted">(leave blank to keep current)</span>}
          <input
            type="password"
            className="w-full mt-1 bg-black/30 rounded px-3 py-2"
            placeholder={spotify.has_client_secret ? "••••••••" : "Required"}
            value={spotify.client_secret}
            onChange={(e) => setSpotify({ ...spotify, client_secret: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Redirect URI (copy to Spotify Dashboard)
          <input
            className="w-full mt-1 bg-black/30 rounded px-3 py-2 font-mono text-xs"
            value={spotify.redirect_uri}
            onChange={(e) => setSpotify({ ...spotify, redirect_uri: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Public web URL (after OAuth)
          <input
            className="w-full mt-1 bg-black/30 rounded px-3 py-2"
            value={spotify.public_web_url}
            onChange={(e) => setSpotify({ ...spotify, public_web_url: e.target.value })}
          />
        </label>
        <button type="submit" className="bg-spotify text-black px-4 py-2 rounded-full text-sm font-semibold">
          Save Spotify
        </button>
        {spotify.configured && <p className="text-xs text-spotify">Spotify app credentials are active.</p>}
      </form>

      <form onSubmit={saveLidarr} className="bg-panel p-4 rounded-lg space-y-3">
        <h4 className="font-medium">Lidarr (optional)</h4>
        <p className="text-xs text-muted">{lidarr.note}</p>
        <label className="block text-sm">
          Base URL
          <input
            className="w-full mt-1 bg-black/30 rounded px-3 py-2"
            placeholder="http://localhost:8686"
            value={lidarr.base_url}
            onChange={(e) => setLidarr({ ...lidarr, base_url: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          API key
          <input
            type="password"
            className="w-full mt-1 bg-black/30 rounded px-3 py-2"
            placeholder={lidarr.has_api_key ? "Leave blank to keep" : "From Lidarr → Settings → General"}
            value={lidarr.api_key}
            onChange={(e) => setLidarr({ ...lidarr, api_key: e.target.value })}
          />
        </label>
        <button type="submit" className="bg-white/10 px-4 py-2 rounded-full text-sm font-semibold">
          Save Lidarr
        </button>
      </form>
    </section>
  );
}
