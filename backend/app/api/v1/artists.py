"""Artist pages: tracks and playlists for a credited artist name."""

from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.playlist import Playlist
from app.models.track import Track
from app.models.user import User
from app.models.user_track import UserTrack
from app.schemas.auth import PlaylistPublic, TrackPublic
from app.services.artists import split_artists, track_has_artist

router = APIRouter(prefix="/artists", tags=["artists"])


class ArtistPage(BaseModel):
    name: str
    tracks: list[TrackPublic]
    playlists: list[PlaylistPublic]
    total_duration_seconds: int
    art_urls: list[str]


def _cover(p) -> str | None:
    return f"/api/v1/playlists/{p.id}/cover" if getattr(p, "cover_relative_path", None) else None


def _track_public(track: Track, added_at=None, added_via=None) -> TrackPublic:
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
    )


@router.get("/{artist_name:path}", response_model=ArtistPage)
def get_artist(
    artist_name: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ArtistPage:
    name = unquote(artist_name).strip()
    if not name or len(name) > 256:
        raise HTTPException(status_code=400, detail="Invalid artist name")

    rows = db.execute(
        select(Track, UserTrack.added_at, UserTrack.added_via)
        .join(UserTrack, UserTrack.track_id == Track.id)
        .where(UserTrack.user_id == user.id)
        .order_by(Track.title)
    ).all()

    matched: list[tuple[Track, object, str | None]] = [
        (track, added_at, added_via)
        for track, added_at, added_via in rows
        if track_has_artist(track.artist, name)
    ]
    if not matched:
        raise HTTPException(status_code=404, detail="Artist not found in your library")

    track_ids = {t.id for t, _, _ in matched}
    playlists = db.scalars(
        select(Playlist)
        .where(Playlist.user_id == user.id)
        .options(selectinload(Playlist.tracks))
        .order_by(Playlist.is_liked_songs.desc(), Playlist.name)
    ).all()
    in_playlists = [
        PlaylistPublic(
            id=p.id,
            name=p.name,
            description=p.description,
            is_liked_songs=p.is_liked_songs,
            track_count=len(p.tracks),
            cover_url=_cover(p),
        )
        for p in playlists
        if any(pt.track_id in track_ids for pt in p.tracks)
    ]

    arts: list[str] = []
    for t, _, _ in matched:
        if t.art_relative_path:
            arts.append(f"/api/v1/tracks/{t.id}/art")
        if len(arts) >= 4:
            break

    total = sum(t.duration_seconds or 0 for t, _, _ in matched)
    display = name
    for t, _, _ in matched:
        for part in split_artists(t.artist):
            if part.lower() == name.lower():
                display = part
                break

    return ArtistPage(
        name=display,
        tracks=[_track_public(t, a, v) for t, a, v in matched],
        playlists=in_playlists,
        total_duration_seconds=total,
        art_urls=arts,
    )
