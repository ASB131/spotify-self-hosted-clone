"""Downloadable Chrome extension bundle (Manifest V3)."""

import io
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.api.deps import get_current_user
from app.config import get_settings
from app.models.user import User

router = APIRouter(prefix="/extension", tags=["extension"])
settings = get_settings()


def _extension_root() -> Path:
    root = Path(settings.extension_dir)
    if not root.is_dir():
        raise HTTPException(status_code=503, detail="Extension files not bundled on this server")
    return root


@router.get("/download")
def download_extension_zip(_user: User = Depends(get_current_user)) -> StreamingResponse:
    """Zip the MV3 extension for manual load in chrome://extensions (Developer mode)."""
    root = _extension_root()
    required = ["manifest.json", "content.js", "background.js"]
    for name in required:
        if not (root / name).is_file():
            raise HTTPException(status_code=503, detail=f"Extension missing {name}")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in root.rglob("*"):
            if path.is_file():
                zf.write(path, arcname=str(path.relative_to(root)).replace("\\", "/"))
    buf.seek(0)
    headers = {"Content-Disposition": 'attachment; filename="mix-player-chrome-extension.zip"'}
    return StreamingResponse(buf, media_type="application/zip", headers=headers)
