"""Admin upload for YouTube cookies (optional; improves reliability)."""

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.api.deps import require_admin
from app.config import get_settings
from app.models.user import User

router = APIRouter(prefix="/admin/youtube", tags=["admin-youtube"])
settings = get_settings()


class CookiesStatus(BaseModel):
    configured: bool
    source: str | None
    hint: str


def _uploaded_path() -> Path:
    return Path(settings.app_data) / "cookies.txt"


@router.get("/cookies", response_model=CookiesStatus)
def cookies_status(_admin: User = Depends(require_admin)) -> CookiesStatus:
    uploaded = _uploaded_path()
    mounted = Path(settings.ytdlp_cookies_path)

    def valid(p: Path) -> bool:
        if not p.is_file():
            return False
        try:
            lines = [
                ln
                for ln in p.read_text(encoding="utf-8", errors="ignore").splitlines()
                if ln.strip() and not ln.strip().startswith("#")
            ]
            return len(lines) >= 3
        except OSError:
            return False

    if valid(uploaded):
        return CookiesStatus(
            configured=True,
            source="uploaded",
            hint="Using cookies uploaded via Admin. Downloads work better with these.",
        )
    if valid(mounted):
        return CookiesStatus(
            configured=True,
            source="mounted",
            hint="Using cookies.txt mounted into the container.",
        )
    return CookiesStatus(
        configured=False,
        source=None,
        hint=(
            "Optional: upload a Netscape cookies.txt from YouTube (logged-in browser). "
            "Most videos work without it via mobile YouTube clients; cookies help when YouTube blocks the server."
        ),
    )


@router.post("/cookies", response_model=CookiesStatus)
async def upload_cookies(
    file: UploadFile = File(...),
    _admin: User = Depends(require_admin),
) -> CookiesStatus:
    raw = await file.read()
    try:
        text = raw.decode("utf-8", errors="ignore")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid file: {exc}") from exc
    lines = [ln for ln in text.splitlines() if ln.strip() and not ln.strip().startswith("#")]
    if len(lines) < 3:
        raise HTTPException(
            status_code=400,
            detail="File does not look like a Netscape cookies.txt (too few cookie rows).",
        )
    dest = _uploaded_path()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(text, encoding="utf-8")
    return CookiesStatus(
        configured=True,
        source="uploaded",
        hint="Cookies saved. New downloads will use them automatically (no Docker restart needed).",
    )


@router.delete("/cookies", response_model=CookiesStatus)
def delete_uploaded_cookies(_admin: User = Depends(require_admin)) -> CookiesStatus:
    dest = _uploaded_path()
    if dest.is_file():
        dest.unlink()
    uploaded = _uploaded_path()
    mounted = Path(settings.ytdlp_cookies_path)

    def valid(p: Path) -> bool:
        if not p.is_file():
            return False
        try:
            lines = [
                ln
                for ln in p.read_text(encoding="utf-8", errors="ignore").splitlines()
                if ln.strip() and not ln.strip().startswith("#")
            ]
            return len(lines) >= 3
        except OSError:
            return False

    if valid(mounted):
        return CookiesStatus(configured=True, source="mounted", hint="Uploaded cookies removed; mounted cookies still active.")
    return CookiesStatus(
        configured=False,
        source=None,
        hint="Cookies cleared. Downloads still work for most videos via mobile YouTube clients.",
    )
