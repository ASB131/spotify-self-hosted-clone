"""Admin view of non-secret server configuration."""

from pathlib import Path

from fastapi import APIRouter, Depends

from app.api.deps import require_admin
from app.config import get_settings
from app.models.user import User

router = APIRouter(prefix="/admin", tags=["admin"])
settings = get_settings()


@router.get("/server-setup")
def admin_server_setup(_admin: User = Depends(require_admin)):
    cookies_path = settings.ytdlp_cookies_path
    cookies_ok = Path(cookies_path).is_file() and Path(cookies_path).stat().st_size > 80
    return {
        "spotify_client_id_set": bool(settings.spotify_client_id.strip()),
        "spotify_client_secret_set": bool(settings.spotify_client_secret.strip()),
        "spotify_redirect_uri": settings.spotify_redirect_uri,
        "public_web_url": settings.public_web_url,
        "youtube_cookies_path": cookies_path,
        "youtube_cookies_ready": cookies_ok,
        "cors_origins": settings.cors_origin_list(),
        "env_hints": {
            "spotify": "Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI in .env. "
            "Create an app at https://developer.spotify.com/dashboard — redirect URI must match exactly.",
            "youtube": "Export browser cookies to cookies.txt on the host and mount via COOKIES_FILE in docker-compose.",
            "cors": "After loading the Chrome extension, copy its ID from chrome://extensions into CORS_ORIGINS.",
        },
    }
