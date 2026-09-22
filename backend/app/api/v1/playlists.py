"""Playlists CRUD and track membership."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.playlist import Playlist, PlaylistTrack
from app.models.user import User
from app.schemas.auth import PlaylistPublic, TrackPublic

router = APIRouter(prefix="/playlists", tags=["playlists"])


class PlaylistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    description: str | None = None


def _playlist_public(p: Playlist) -> PlaylistPublic:
    return PlaylistPublic(
        id=p.id,
        name=p.name,
        description=p.description,
        is_liked_songs=p.is_liked_songs,
        track_count=len(p.tracks),
    )


def _track_public_from_pt(pt: PlaylistTrack) -> TrackPublic:
    t = pt.track
    return TrackPublic(
        id=t.id,
        title=t.title,
        artist=t.artist,
        album=t.album,
        duration_seconds=t.duration_seconds,
        format=t.format.value,
        file_size_bytes=t.file_size_bytes,
        art_url=f"/api/v1/tracks/{t.id}/art" if t.art_relative_path else None,
        added_at=pt.added_at,
    )


@router.get("", response_model=list[PlaylistPublic])
def list_playlists(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Playlist)
        .where(Playlist.user_id == user.id)
        .options(selectinload(Playlist.tracks))
        .order_by(Playlist.is_liked_songs.desc(), Playlist.name)
    ).all()
    return [_playlist_public(p) for p in rows]


@router.post("", response_model=PlaylistPublic)
def create_playlist(body: PlaylistCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pl = Playlist(user_id=user.id, name=body.name.strip(), description=body.description, is_liked_songs=False)
    db.add(pl)
    db.commit()
    db.refresh(pl)
    return PlaylistPublic(
        id=pl.id, name=pl.name, description=pl.description, is_liked_songs=False, track_count=0
    )


@router.get("/{playlist_id}", response_model=PlaylistPublic)
def get_playlist(playlist_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pl = db.scalar(
        select(Playlist)
        .where(Playlist.id == playlist_id, Playlist.user_id == user.id)
        .options(selectinload(Playlist.tracks))
    )
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return _playlist_public(pl)


@router.get("/{playlist_id}/tracks", response_model=list[TrackPublic])
def playlist_tracks(playlist_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pl = db.scalar(
        select(Playlist)
        .where(Playlist.id == playlist_id, Playlist.user_id == user.id)
        .options(selectinload(Playlist.tracks).selectinload(PlaylistTrack.track))
    )
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")
    ordered = sorted(pl.tracks, key=lambda x: x.position)
    return [_track_public_from_pt(pt) for pt in ordered]


@router.delete("/{playlist_id}")
def delete_playlist(playlist_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pl = db.get(Playlist, playlist_id)
    if not pl or pl.user_id != user.id:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if pl.is_liked_songs:
        raise HTTPException(status_code=400, detail="Cannot delete Liked Songs")
    db.delete(pl)
    db.commit()
    return {"deleted": True}
