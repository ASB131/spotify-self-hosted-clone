"""Track library, streaming, search, delete, quality upgrade."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.track import Track
from app.models.user import User
from app.models.user_track import UserTrack
from app.schemas.auth import SearchResults, TrackPublic, UpgradeQualityRequest
from app.services.search import search_library
from app.services.streaming import stream_track
from app.services.track_cleanup import remove_user_track_membership
from app.workers.tasks import upgrade_track_quality

router = APIRouter(prefix="/tracks", tags=["tracks"])


def _track_public(track: Track, added_at: datetime | None = None) -> TrackPublic:
    art_url = f"/api/v1/tracks/{track.id}/art" if track.art_relative_path else None
    return TrackPublic(
        id=track.id,
        title=track.title,
        artist=track.artist,
        album=track.album,
        duration_seconds=track.duration_seconds,
        format=track.format.value,
        file_size_bytes=track.file_size_bytes,
        art_url=art_url,
        added_at=added_at,
    )


@router.get("", response_model=list[TrackPublic])
def list_tracks(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[TrackPublic]:
    rows = db.execute(
        select(Track, UserTrack.added_at)
        .join(UserTrack, UserTrack.track_id == Track.id)
        .where(UserTrack.user_id == user.id)
        .order_by(UserTrack.added_at.desc())
    ).all()
    return [_track_public(track, added_at) for track, added_at in rows]


@router.get("/search", response_model=SearchResults)
def search(
    q: str = Query(min_length=2),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SearchResults:
    tracks, playlists = search_library(db, user.id, q)
    from app.schemas.auth import PlaylistPublic

    return SearchResults(
        tracks=[_track_public(t) for t in tracks],
        playlists=[
            PlaylistPublic(
                id=p.id,
                name=p.name,
                description=p.description,
                is_liked_songs=p.is_liked_songs,
                track_count=len(p.tracks),
            )
            for p in playlists
        ],
    )


@router.get("/{track_id}/stream")
def stream(
    track_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return stream_track(db, user.id, track_id, request)


@router.get("/{track_id}/art")
def track_art(track_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from fastapi import HTTPException
    from fastapi.responses import FileResponse

    from app.services.storage_paths import art_file_path

    track = db.get(Track, track_id)
    if not track or not track.art_relative_path:
        raise HTTPException(status_code=404, detail="Art not found")
    link = db.scalar(select(UserTrack).where(UserTrack.user_id == user.id, UserTrack.track_id == track_id))
    if not link:
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        path = art_file_path(track.art_relative_path)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Art file missing")
    return FileResponse(path, media_type="image/jpeg")


@router.delete("/{track_id}")
def delete_track(track_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    removed = remove_user_track_membership(db, user.id, track_id)
    db.commit()
    return {"deleted": True, "file_removed": removed}


@router.post("/upgrade-quality")
def upgrade_quality(body: UpgradeQualityRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    link = db.scalar(select(UserTrack).where(UserTrack.user_id == user.id, UserTrack.track_id == body.track_id))
    if not link:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Track not in library")
    task = upgrade_track_quality.delay(user.id, body.track_id)
    return {"task_id": task.id, "status": "queued"}
