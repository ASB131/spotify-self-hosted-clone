"""Admin: manage Spotify and Lidarr integration settings from the web UI."""

from pydantic import BaseModel, Field


class SpotifyIntegrationPublic(BaseModel):
    client_id: str
    has_client_secret: bool
    redirect_uri: str
    public_web_url: str
    configured: bool
    redirect_help: str = (
        "Use http://localhost:8000/api/v1/spotify/callback for local Docker. "
        "Spotify shows 'not secure' for http://localhost — that is expected for development. "
        "Production requires https:// on a public domain."
    )


class SpotifyIntegrationUpdate(BaseModel):
    client_id: str = Field(max_length=256)
    client_secret: str | None = Field(default=None, max_length=512)
    redirect_uri: str = Field(max_length=512)
    public_web_url: str = Field(max_length=512)


class LidarrIntegrationPublic(BaseModel):
    base_url: str
    has_api_key: bool
    configured: bool
    note: str = (
        "Lidarr is a separate app (cannot be embedded). Optional: `docker compose --profile arr up -d`. "
        "Point Lidarr at your existing qBittorrent (host.docker.internal or LAN IP), root folder /music, "
        "torrent indexers, then paste Lidarr URL + API key here. Discovery uses Lidarr only when healthy."
    )


class LidarrIntegrationUpdate(BaseModel):
    base_url: str = Field(default="", max_length=512)
    api_key: str | None = Field(default=None, max_length=256)
