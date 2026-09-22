"""Playlists CRUD, cover art, and track membership."""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.playlist import Playlist, PlaylistTrack
from app.models.user import User
from app.schemas.auth import PlaylistPublic, PlaylistUpdate, TrackPublic
from app.services.storage_paths import (
    art_file_path,
    ensure_parent,
    playlist_cover_relative_path,
)

router = APIRouter(prefix="/playlists", tags=["playlists"])

ALLOWED_IMAGE = {"image/jpeg", "image/png", "image/webp", "image/jpg"}


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
        cover_url=f"/api/v1/playlists/{p.id}/cover" if p.cover_relative_path else None,
    )


def _track_public_from_pt(pt: PlaylistTrack, added_via: str | None = None) -> TrackPublic:
    t = pt.track
    return TrackPublic(
        id=t.id,
        title=t.title,
        artist=t.artist,
        album=t.album,
        duration_seconds=t.duration_seconds,
        format=t.format.value,
        file_size_bytes=t.file_size_bytes,
        source=t.source.value if hasattr(t.source, "value") else str(t.source),
        added_via=added_via,
        art_url=f"/api/v1/tracks/{t.id}/art" if t.art_relative_path else None,
        added_at=pt.added_at,
    )


def _owned_playlist(db: Session, user: User, playlist_id: int) -> Playlist:
    pl = db.scalar(
        select(Playlist)
        .where(Playlist.id == playlist_id, Playlist.user_id == user.id)
        .options(selectinload(Playlist.tracks))
    )
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return pl


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
        id=pl.id,
        name=pl.name,
        description=pl.description,
        is_liked_songs=False,
        track_count=0,
        cover_url=None,
    )


@router.get("/{playlist_id}", response_model=PlaylistPublic)
def get_playlist(playlist_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _playlist_public(_owned_playlist(db, user, playlist_id))


@router.patch("/{playlist_id}", response_model=PlaylistPublic)
def update_playlist(
    playlist_id: int,
    body: PlaylistUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pl = _owned_playlist(db, user, playlist_id)
    if pl.is_liked_songs and body.name is not None:
        raise HTTPException(status_code=400, detail="Cannot rename All Songs")
    if body.name is not None:
        pl.name = body.name.strip()
    if body.description is not None:
        pl.description = body.description
    db.add(pl)
    db.commit()
    db.refresh(pl)
    pl = _owned_playlist(db, user, playlist_id)
    return _playlist_public(pl)


class PlaylistTrackAdd(BaseModel):
    track_id: int


@router.post("/{playlist_id}/tracks", response_model=TrackPublic)
def add_track_to_playlist(
    playlist_id: int,
    body: PlaylistTrackAdd,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.models.track import Track
    from app.models.user_track import UserTrack
    from app.services.library import _add_to_playlist

    pl = _owned_playlist(db, user, playlist_id)
    track = db.get(Track, body.track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    owned = db.scalar(
        select(UserTrack).where(UserTrack.user_id == user.id, UserTrack.track_id == track.id)
    )
    if not owned:
        raise HTTPException(status_code=404, detail="Track not in your library")
    _add_to_playlist(db, pl.id, track.id)
    db.commit()
    pt = db.scalar(
        select(PlaylistTrack)
        .where(PlaylistTrack.playlist_id == pl.id, PlaylistTrack.track_id == track.id)
        .options(selectinload(PlaylistTrack.track))
    )
    if not pt:
        raise HTTPException(status_code=500, detail="Failed to add track")
    return _track_public_from_pt(pt)


@router.delete("/{playlist_id}/tracks/{track_id}")
def remove_track_from_playlist(
    playlist_id: int,
    track_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pl = _owned_playlist(db, user, playlist_id)
    if pl.is_liked_songs:
        raise HTTPException(
            status_code=400,
            detail="Cannot remove tracks from All Songs — delete the song from your library instead",
        )
    pt = db.scalar(
        select(PlaylistTrack).where(
            PlaylistTrack.playlist_id == pl.id, PlaylistTrack.track_id == track_id
        )
    )
    if not pt:
        raise HTTPException(status_code=404, detail="Track not in playlist")
    db.delete(pt)
    db.commit()
    return {"deleted": True}


@router.post("/{playlist_id}/cover", response_model=PlaylistPublic)
async def upload_playlist_cover(
    playlist_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pl = _owned_playlist(db, user, playlist_id)
    if pl.is_liked_songs:
        raise HTTPException(status_code=400, detail="Cannot change All Songs cover")
    ctype = (file.content_type or "").lower()
    if ctype not in ALLOWED_IMAGE:
        raise HTTPException(status_code=400, detail="Cover must be JPEG, PNG, or WebP")
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Cover too large (max 8MB)")
    rel = playlist_cover_relative_path(user.id, pl.id)
    path = art_file_path(rel)
    ensure_parent(path)
    path.write_bytes(data)
    pl.cover_relative_path = rel
    db.add(pl)
    db.commit()
    pl = _owned_playlist(db, user, playlist_id)
    return _playlist_public(pl)


@router.get("/{playlist_id}/cover")
def playlist_cover(playlist_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pl = _owned_playlist(db, user, playlist_id)
    if not pl.cover_relative_path:
        raise HTTPException(status_code=404, detail="No cover")
    try:
        path = art_file_path(pl.cover_relative_path)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Cover missing")
    media = "image/jpeg"
    if path.suffix.lower() == ".png":
        media = "image/png"
    elif path.suffix.lower() == ".webp":
        media = "image/webp"
    return FileResponse(path, media_type=media)


@router.get("/{playlist_id}/tracks", response_model=list[TrackPublic])
def playlist_tracks(playlist_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.models.user_track import UserTrack

    pl = db.scalar(
        select(Playlist)
        .where(Playlist.id == playlist_id, Playlist.user_id == user.id)
        .options(selectinload(Playlist.tracks).selectinload(PlaylistTrack.track))
    )
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")
    ordered = sorted(
        pl.tracks,
        key=lambda x: (x.added_at is not None, x.added_at or x.position),
        reverse=True,
    )
    via_map = {
        ut.track_id: ut.added_via
        for ut in db.scalars(select(UserTrack).where(UserTrack.user_id == user.id)).all()
    }
    return [_track_public_from_pt(pt, via_map.get(pt.track_id)) for pt in ordered]


@router.delete("/{playlist_id}")
def delete_playlist(playlist_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pl = db.get(Playlist, playlist_id)
    if not pl or pl.user_id != user.id:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if pl.is_liked_songs:
        raise HTTPException(status_code=400, detail="Cannot delete All Songs")
    if pl.cover_relative_path:
        try:
            path = art_file_path(pl.cover_relative_path)
            if path.is_file():
                path.unlink()
        except (ValueError, OSError):
            pass
    db.delete(pl)
    db.commit()
    return {"deleted": True}
