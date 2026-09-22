"""Album grouping from track album+artist strings (no Album table)."""

from __future__ import annotations

import hashlib
from collections import defaultdict
from typing import Optional
from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.track import Track
from app.models.user import User
from app.models.user_track import UserTrack
from app.schemas.auth import TrackPublic

router = APIRouter(prefix="/albums", tags=["albums"])


class AlbumSummary(BaseModel):
    key: str
    name: str
    artist: str
    track_count: int
    total_duration_seconds: int
    art_url: Optional[str] = None


class AlbumDetail(AlbumSummary):
    tracks: list[TrackPublic]


def _album_parts(album: str | None, artist: str) -> tuple[str, str]:
    name = (album or "").strip() or "Unknown Album"
    primary = (artist or "Unknown Artist").split(",")[0].strip() or "Unknown Artist"
    return name, primary


def _album_key(album: str, artist: str) -> str:
    raw = f"{album}|{artist}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _parse_key_param(key: str) -> tuple[str, str] | None:
    """Accept sha1 short hash lookup via listing, or encodeURIComponent(album|artist)."""
    decoded = unquote(key)
    if "|" in decoded:
        album, artist = decoded.split("|", 1)
        return album.strip() or "Unknown Album", artist.strip() or "Unknown Artist"
    return None


def _track_public(track: Track, added_at, added_via, is_liked: bool) -> TrackPublic:
    return TrackPublic(
        id=track.id,
        title=track.title,
        artist=track.artist,
        album=track.album,
        duration_seconds=track.duration_seconds,
        format=track.format.value,
        file_size_bytes=track.file_size_bytes,
        source=track.source.value if hasattr(track.source, "value") else str(track.source),
        added_via=added_via,
        art_url=f"/api/v1/tracks/{track.id}/art" if track.art_relative_path else None,
        added_at=added_at,
        is_liked=is_liked,
    )


@router.get("", response_model=list[AlbumSummary])
def list_albums(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(Track, UserTrack.added_at, UserTrack.added_via, UserTrack.is_liked)
        .join(UserTrack, UserTrack.track_id == Track.id)
        .where(UserTrack.user_id == user.id)
    ).all()
    groups: dict[tuple[str, str], list] = defaultdict(list)
    for track, added_at, added_via, is_liked in rows:
        name, artist = _album_parts(track.album, track.artist)
        groups[(name, artist)].append((track, added_at, added_via, is_liked))

    out: list[AlbumSummary] = []
    for (name, artist), items in groups.items():
        art = next((t.art_relative_path and f"/api/v1/tracks/{t.id}/art" for t, *_ in items if t.art_relative_path), None)
        out.append(
            AlbumSummary(
                key=_album_key(name, artist),
                name=name,
                artist=artist,
                track_count=len(items),
                total_duration_seconds=sum(t.duration_seconds or 0 for t, *_ in items),
                art_url=art,
            )
        )
    out.sort(key=lambda a: a.name.lower())
    return out


@router.get("/{key}", response_model=AlbumDetail)
def get_album(key: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(Track, UserTrack.added_at, UserTrack.added_via, UserTrack.is_liked)
        .join(UserTrack, UserTrack.track_id == Track.id)
        .where(UserTrack.user_id == user.id)
    ).all()

    parsed = _parse_key_param(key)
    matched: list = []
    album_name = ""
    album_artist = ""

    for track, added_at, added_via, is_liked in rows:
        name, artist = _album_parts(track.album, track.artist)
        if parsed:
            if name == parsed[0] and artist.lower() == parsed[1].lower():
                matched.append((track, added_at, added_via, is_liked))
                album_name, album_artist = name, artist
        else:
            if _album_key(name, artist) == key:
                matched.append((track, added_at, added_via, is_liked))
                album_name, album_artist = name, artist

    if not matched:
        raise HTTPException(status_code=404, detail="Album not found")

    art = next((t.art_relative_path and f"/api/v1/tracks/{t.id}/art" for t, *_ in matched if t.art_relative_path), None)
    tracks = [_track_public(t, a, v, liked) for t, a, v, liked in matched]
    tracks.sort(key=lambda t: t.title.lower())
    return AlbumDetail(
        key=_album_key(album_name, album_artist),
        name=album_name,
        artist=album_artist,
        track_count=len(tracks),
        total_duration_seconds=sum(t.duration_seconds or 0 for t in tracks),
        art_url=art,
        tracks=tracks,
    )
