"""Resolved Spotify/Lidarr settings: database overrides .env."""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.server_config import get_or_create_config
from app.services.secret_box import decrypt_value


@dataclass
class SpotifySettings:
    client_id: str
    client_secret: str
    redirect_uri: str
    public_web_url: str
    configured: bool


@dataclass
class LidarrSettings:
    base_url: str
    api_key: str
    configured: bool


def spotify_settings(db: Session) -> SpotifySettings:
    env = get_settings()
    row = get_or_create_config(db)
    client_id = (row.spotify_client_id or "").strip() or env.spotify_client_id.strip()
    secret = ""
    if row.spotify_client_secret_enc:
        try:
            secret = decrypt_value(row.spotify_client_secret_enc)
        except Exception:
            secret = ""
    if not secret:
        secret = env.spotify_client_secret.strip()
    redirect = (row.spotify_redirect_uri or "").strip() or env.spotify_redirect_uri
    web_url = (row.public_web_url or "").strip() or env.public_web_url
    configured = bool(client_id and secret)
    return SpotifySettings(
        client_id=client_id,
        client_secret=secret,
        redirect_uri=redirect,
        public_web_url=web_url,
        configured=configured,
    )


def lidarr_settings(db: Session) -> LidarrSettings:
    row = get_or_create_config(db)
    base = (row.lidarr_base_url or "").strip()
    key = ""
    if row.lidarr_api_key_enc:
        try:
            key = decrypt_value(row.lidarr_api_key_enc)
        except Exception:
            key = ""
    return LidarrSettings(base_url=base, api_key=key, configured=bool(base and key))
