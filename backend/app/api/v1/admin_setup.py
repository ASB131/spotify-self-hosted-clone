"""Admin view of non-secret server configuration."""

from pathlib import Path

from fastapi import APIRouter, Depends

from app.api.deps import require_admin
from app.config import get_settings
from app.models.user import User
from app.services.integrations import lidarr_settings, spotify_settings
from sqlalchemy.orm import Session
from app.database import get_db

router = APIRouter(prefix="/admin", tags=["admin"])
settings = get_settings()


@router.get("/server-setup")
def admin_server_setup(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    sp = spotify_settings(db)
    lid = lidarr_settings(db)
    cookies_path = settings.ytdlp_cookies_path
    cookies_ok = Path(cookies_path).is_file() and Path(cookies_path).stat().st_size > 80
    return {
        "spotify_configured": sp.configured,
        "spotify_redirect_uri": sp.redirect_uri,
        "public_web_url": sp.public_web_url,
        "lidarr_configured": lid.configured,
        "youtube_cookies_path": cookies_path,
        "youtube_cookies_ready": cookies_ok,
        "configure_in_ui": "Admin → Integrations (Spotify Client ID/Secret, Lidarr URL/key)",
    }
