"""Queue download jobs from web or extension."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.playlist import Playlist
from app.models.user import User
from app.schemas.auth import DownloadRequest
from app.workers.tasks import download_youtube_track

router = APIRouter(prefix="/downloads", tags=["downloads"])


@router.post("")
def queue_download(body: DownloadRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.playlist_id:
        pl = db.get(Playlist, body.playlist_id)
        if not pl or pl.user_id != user.id:
            raise HTTPException(status_code=404, detail="Playlist not found")

    if user.storage_used_bytes >= user.storage_quota_bytes:
        raise HTTPException(status_code=403, detail="Storage quota exceeded")

    fmt = body.format.lower()
    if fmt not in ("mp3", "flac"):
        raise HTTPException(status_code=400, detail="format must be mp3 or flac")

    task = download_youtube_track.delay(
        user_id=user.id,
        url=body.url,
        title=body.title,
        artist=body.artist,
        audio_format=fmt,
        playlist_id=body.playlist_id,
        add_to_liked=body.add_to_liked,
    )
    return {"task_id": task.id, "status": "queued"}
