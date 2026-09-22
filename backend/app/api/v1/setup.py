"""Server and user setup status for in-app onboarding."""

from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.schemas.setup import ServerSetupPublic, UserSetupChecklist
from app.services import listenbrainz as lb
from app.services import musicbrainz as mb
from app.services.integrations import lidarr_settings, spotify_settings
from app.services.lidarr_client import LidarrClient

router = APIRouter(prefix="/setup", tags=["setup"])
settings = get_settings()


def _cookies_ready() -> bool:
    path = Path(settings.ytdlp_cookies_path)
    if not path.is_file():
        return False
    try:
        return path.stat().st_size > 80
    except OSError:
        return False


def _integration_health(db: Session) -> dict:
    lid = lidarr_settings(db)
    detail = LidarrClient(lid).status_detail()
    lb_ok = False
    mb_ok = False
    try:
        fr = lb.fresh_releases(days=1)
        lb_ok = isinstance(fr, list)
    except Exception:
        lb_ok = False
    try:
        mb_ok = mb.search_artist("Daft Punk") is not None
    except Exception:
        mb_ok = False
    return {
        "lidarr_configured": detail["configured"],
        "lidarr_reachable": detail["reachable"],
        "lidarr_hint": detail.get("hint"),
        "lidarr_ready": bool(
            detail["reachable"]
            and detail.get("root_folders", 0) > 0
            and detail.get("download_clients", 0) > 0
        ),
        "listenbrainz_ok": lb_ok,
        "musicbrainz_ok": mb_ok,
    }


@router.get("/server", response_model=ServerSetupPublic)
def server_setup_public(db: Session = Depends(get_db)) -> ServerSetupPublic:
    count = db.scalar(select(func.count()).select_from(User)) or 0
    sp = spotify_settings(db)
    health = _integration_health(db)
    return ServerSetupPublic(
        needs_setup=count == 0,
        spotify_server_configured=sp.configured,
        youtube_cookies_ready=_cookies_ready(),
        spotify_redirect_uri=sp.redirect_uri,
        public_web_url=sp.public_web_url,
        lidarr_configured=health["lidarr_configured"],
        lidarr_reachable=health["lidarr_reachable"],
        lidarr_hint=health["lidarr_hint"],
        listenbrainz_ok=health["listenbrainz_ok"],
        musicbrainz_ok=health["musicbrainz_ok"],
    )


@router.get("/checklist", response_model=UserSetupChecklist)
def user_setup_checklist(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> UserSetupChecklist:
    sp = spotify_settings(db)
    health = _integration_health(db)
    return UserSetupChecklist(
        spotify_server_configured=sp.configured,
        spotify_account_linked=bool(user.spotify_refresh_token),
        spotify_redirect_uri=sp.redirect_uri,
        extension_cors_hint=(
            "Reload the unpacked extension after updates. API calls go through the extension "
            "background worker (no CORS_ORIGINS edit required for YouTube saves). "
            "Keep API URL = http://localhost:8000 and a fresh token from Extension connect."
        ),
        lidarr_ready=health["lidarr_ready"],
        lidarr_hint=health["lidarr_hint"],
    )
