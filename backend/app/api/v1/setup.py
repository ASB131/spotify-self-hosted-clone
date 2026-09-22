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


def _spotify_server_ok() -> bool:
    return bool(settings.spotify_client_id.strip() and settings.spotify_client_secret.strip())


@router.get("/server", response_model=ServerSetupPublic)
def server_setup_public(db: Session = Depends(get_db)) -> ServerSetupPublic:
    count = db.scalar(select(func.count()).select_from(User)) or 0
    return ServerSetupPublic(
        needs_setup=count == 0,
        spotify_server_configured=_spotify_server_ok(),
        youtube_cookies_ready=_cookies_ready(),
        spotify_redirect_uri=settings.spotify_redirect_uri,
        public_web_url=settings.public_web_url,
    )


@router.get("/checklist", response_model=UserSetupChecklist)
def user_setup_checklist(user: User = Depends(get_current_user)) -> UserSetupChecklist:
    return UserSetupChecklist(
        spotify_server_configured=_spotify_server_ok(),
        spotify_account_linked=bool(user.spotify_refresh_token),
        spotify_redirect_uri=settings.spotify_redirect_uri,
        extension_cors_hint="Add chrome-extension://YOUR_EXTENSION_ID to CORS_ORIGINS in the server .env, then restart the API.",
    )
