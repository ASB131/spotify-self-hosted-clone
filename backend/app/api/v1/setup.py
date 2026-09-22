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


@router.get("/server", response_model=ServerSetupPublic)
def server_setup_public(db: Session = Depends(get_db)) -> ServerSetupPublic:
    count = db.scalar(select(func.count()).select_from(User)) or 0
    return ServerSetupPublic(
        needs_setup=count == 0,
        youtube_cookies_ready=_cookies_ready(),
        public_web_url=settings.public_web_url,
    )


@router.get("/checklist", response_model=UserSetupChecklist)
def user_setup_checklist(
    _user: User = Depends(get_current_user),
) -> UserSetupChecklist:
    return UserSetupChecklist(
        youtube_cookies_ready=_cookies_ready(),
        extension_cors_hint=(
            "Reload the unpacked extension after updates. API calls go through the extension "
            "background worker (no CORS_ORIGINS edit required for YouTube saves). "
            "Keep API URL set to your Media player API and a fresh token from Extension connect."
        ),
    )
