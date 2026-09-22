"""Home feed and play history (discovery playlists removed)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.discovery import PlayEvent
from app.models.track import Track
from app.models.user import User
from app.models.user_track import UserTrack
from app.models.playlist import Playlist
from app.schemas.auth import PlaylistPublic, TrackPublic

router = APIRouter(tags=["home"])


class RecentPlaylistPublic(BaseModel):
    id: int
    name: str
    is_liked_songs: bool
    cover_url: Optional[str] = None
    played_at: datetime


class HomeResponse(BaseModel):
    all_songs: Optional[PlaylistPublic] = None
    recently_played_tracks: list[TrackPublic] = []
    recently_played_playlists: list[RecentPlaylistPublic] = []


class PlayCreate(BaseModel):
    track_id: int
    playlist_id: Optional[int] = None


@router.get("/home", response_model=HomeResponse)
def home_feed(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    liked = db.scalar(
        select(Playlist)
        .where(Playlist.user_id == user.id, Playlist.is_liked_songs.is_(True))
        .options(selectinload(Playlist.tracks))
    )
    all_songs = None
    if liked:
        all_songs = PlaylistPublic(
            id=liked.id,
            name=liked.name,
            description=liked.description,
            is_liked_songs=True,
            track_count=len(liked.tracks),
            cover_url=f"/api/v1/playlists/{liked.id}/cover" if liked.cover_relative_path else None,
        )

    play_rows = db.scalars(
        select(PlayEvent)
        .where(PlayEvent.user_id == user.id)
        .options(selectinload(PlayEvent.track))
        .order_by(PlayEvent.played_at.desc())
        .limit(80)
    ).all()
    recent_tracks: list[TrackPublic] = []
    seen_t: set[int] = set()
    for pe in play_rows:
        if pe.track_id in seen_t:
            continue
        t = pe.track or db.get(Track, pe.track_id)
        if not t:
            continue
        seen_t.add(t.id)
        recent_tracks.append(
            TrackPublic(
                id=t.id,
                title=t.title,
                artist=t.artist,
                album=t.album,
                duration_seconds=t.duration_seconds,
                format=t.format.value,
                file_size_bytes=t.file_size_bytes,
                source=t.source.value if hasattr(t.source, "value") else str(t.source),
                art_url=f"/api/v1/tracks/{t.id}/art" if t.art_relative_path else None,
                added_at=pe.played_at,
            )
        )
        if len(recent_tracks) >= 12:
            break

    recent_playlists: list[RecentPlaylistPublic] = []
    seen_p: set[int] = set()
    for pe in play_rows:
        if not pe.playlist_id or pe.playlist_id in seen_p:
            continue
        pl = db.get(Playlist, pe.playlist_id)
        if not pl or pl.user_id != user.id:
            continue
        seen_p.add(pl.id)
        recent_playlists.append(
            RecentPlaylistPublic(
                id=pl.id,
                name=pl.name,
                is_liked_songs=pl.is_liked_songs,
                cover_url=f"/api/v1/playlists/{pl.id}/cover" if pl.cover_relative_path else None,
                played_at=pe.played_at,
            )
        )
        if len(recent_playlists) >= 8:
            break

    return HomeResponse(
        all_songs=all_songs,
        recently_played_tracks=recent_tracks,
        recently_played_playlists=recent_playlists,
    )


@router.post("/me/plays")
def record_play(body: PlayCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owned = db.scalar(
        select(UserTrack).where(UserTrack.user_id == user.id, UserTrack.track_id == body.track_id)
    )
    if not owned:
        raise HTTPException(status_code=404, detail="Track not in your library")
    if body.playlist_id:
        pl = db.get(Playlist, body.playlist_id)
        if not pl or pl.user_id != user.id:
            raise HTTPException(status_code=404, detail="Playlist not found")
    pe = PlayEvent(user_id=user.id, track_id=body.track_id, playlist_id=body.playlist_id)
    db.add(pe)
    db.commit()
    return {"ok": True}


@router.get("/me/recent")
def recent_plays(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(PlayEvent).where(PlayEvent.user_id == user.id).order_by(PlayEvent.played_at.desc()).limit(40)
    ).all()
    return [{"track_id": r.track_id, "playlist_id": r.playlist_id, "played_at": r.played_at} for r in rows]
