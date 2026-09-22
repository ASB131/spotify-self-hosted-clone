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
        "public_web_url": settings.public_web_url,
        "youtube_cookies_path": cookies_path,
        "youtube_cookies_ready": cookies_ok,
        "configure_in_ui": "Admin → Integrations (optional YouTube cookies). Music is added via the Chrome extension only.",
    }
