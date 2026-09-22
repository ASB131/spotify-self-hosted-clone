"""Playlists CRUD and track membership."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.playlist import Playlist, PlaylistTrack
from app.models.track import Track
from app.models.user import User
from app.models.user_track import UserTrack
from app.schemas.auth import PlaylistPublic, TrackPublic

router = APIRouter(prefix="/playlists", tags=["playlists"])


class PlaylistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    description: str | None = None


@router.get("", response_model=list[PlaylistPublic])
def list_playlists(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Playlist).where(Playlist.user_id == user.id).order_by(Playlist.name)).all()
    return [
        PlaylistPublic(
            id=p.id,
            name=p.name,
            description=p.description,
            is_liked_songs=p.is_liked_songs,
            track_count=len(p.tracks),
        )
        for p in rows
    ]


@router.post("", response_model=PlaylistPublic)
def create_playlist(body: PlaylistCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pl = Playlist(user_id=user.id, name=body.name, description=body.description, is_liked_songs=False)
    db.add(pl)
    db.commit()
    db.refresh(pl)
    return PlaylistPublic(
        id=pl.id, name=pl.name, description=pl.description, is_liked_songs=False, track_count=0
    )


@router.get("/{playlist_id}/tracks", response_model=list[TrackPublic])
def playlist_tracks(playlist_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pl = db.get(Playlist, playlist_id)
    if not pl or pl.user_id != user.id:
        raise HTTPException(status_code=404, detail="Playlist not found")
    tracks = [pt.track for pt in sorted(pl.tracks, key=lambda x: x.position)]
    return [
        TrackPublic(
            id=t.id,
            title=t.title,
            artist=t.artist,
            album=t.album,
            duration_seconds=t.duration_seconds,
            format=t.format.value,
            file_size_bytes=t.file_size_bytes,
            art_url=f"/api/v1/tracks/{t.id}/art" if t.art_relative_path else None,
        )
        for t in tracks
    ]
