"""Artist pages + ampersand keep rules for multi-artist credits."""

from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.artist_keep import ArtistKeep
from app.models.playlist import Playlist
from app.models.track import Track
from app.models.user import User
from app.models.user_track import UserTrack
from app.schemas.auth import PlaylistPublic, TrackPublic
from app.services.artist_normalize import (
    apply_keep_to_user_library,
    known_ampersand_artists,
    remove_keep,
)
from app.services.artists import (
    _norm,
    extract_ampersand_chunks,
    split_artists,
)

router = APIRouter(prefix="/artists", tags=["artists"])


class ArtistPage(BaseModel):
    name: str
    tracks: list[TrackPublic]
    playlists: list[PlaylistPublic]
    total_duration_seconds: int
    art_urls: list[str]


class AmpersandKeepPublic(BaseModel):
    id: int | None = None
    display_name: str
    normalized_name: str
    source: str  # builtin | user
    track_count: int = 0


class AmpersandRulesResponse(BaseModel):
    kept: list[AmpersandKeepPublic]
    candidates: list[AmpersandKeepPublic]


class AmpersandKeepCreate(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=512)


class AmpersandKeepCreateResult(BaseModel):
    keep: AmpersandKeepPublic
    tracks_updated: int


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


@router.get("/ampersand-rules", response_model=AmpersandRulesResponse)
def list_ampersand_rules(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AmpersandRulesResponse:
    tracks = db.scalars(
        select(Track)
        .join(UserTrack, UserTrack.track_id == Track.id)
        .where(UserTrack.user_id == user.id)
    ).all()

    chunk_counts: dict[str, tuple[str, int]] = {}
    for t in tracks:
        for chunk in extract_ampersand_chunks(t.artist):
            key = _norm(chunk)
            prev = chunk_counts.get(key)
            chunk_counts[key] = (chunk, (prev[1] if prev else 0) + 1)

    user_rows = db.scalars(select(ArtistKeep).where(ArtistKeep.user_id == user.id)).all()
    user_by_norm = {r.normalized_name: r for r in user_rows}

    kept: list[AmpersandKeepPublic] = []
    seen_kept: set[str] = set()

    for builtin in ("w&w", "d-block & s-te-fan"):
        if builtin in seen_kept:
            continue
        if builtin == "w&w":
            display = chunk_counts.get(builtin, ("W&W", 0))[0]
            if display.lower() in ("w&w", "w & w"):
                display = "W&W"
        else:
            display = chunk_counts.get(builtin, ("D-Block & S-te-Fan", 0))[0]
        count = chunk_counts.get(builtin, (display, 0))[1]
        kept.append(
            AmpersandKeepPublic(
                id=None,
                display_name=display,
                normalized_name=builtin,
                source="builtin",
                track_count=count,
            )
        )
        seen_kept.add(builtin)
        if builtin == "d-block & s-te-fan":
            seen_kept.add("d-block and s-te-fan")
        if builtin == "w&w":
            seen_kept.add("w & w")

    for row in user_rows:
        if row.normalized_name in seen_kept:
            continue
        count = chunk_counts.get(row.normalized_name, (row.display_name, 0))[1]
        kept.append(
            AmpersandKeepPublic(
                id=row.id,
                display_name=row.display_name,
                normalized_name=row.normalized_name,
                source="user",
                track_count=count,
            )
        )
        seen_kept.add(row.normalized_name)

    candidates: list[AmpersandKeepPublic] = []
    for key, (display, count) in sorted(chunk_counts.items(), key=lambda kv: -kv[1][1]):
        if key in seen_kept:
            continue
        row = user_by_norm.get(key)
        candidates.append(
            AmpersandKeepPublic(
                id=row.id if row else None,
                display_name=display,
                normalized_name=key,
                source="user" if row else "candidate",
                track_count=count,
            )
        )

    return AmpersandRulesResponse(kept=kept, candidates=candidates)


@router.post("/ampersand-rules", response_model=AmpersandKeepCreateResult)
def create_ampersand_keep(
    body: AmpersandKeepCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AmpersandKeepCreateResult:
    name = body.display_name.strip()
    if "&" not in name and "＆" not in name:
        raise HTTPException(status_code=400, detail="Name must contain &")
    updated = apply_keep_to_user_library(db, user.id, name)
    key = _norm(name)
    row = db.scalar(select(ArtistKeep).where(ArtistKeep.user_id == user.id, ArtistKeep.normalized_name == key))
    if not row:
        raise HTTPException(status_code=500, detail="Failed to save keep rule")
    return AmpersandKeepCreateResult(
        keep=AmpersandKeepPublic(
            id=row.id,
            display_name=row.display_name,
            normalized_name=row.normalized_name,
            source="user",
            track_count=updated,
        ),
        tracks_updated=updated,
    )


@router.delete("/ampersand-rules/{keep_id}")
def delete_ampersand_keep(
    keep_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not remove_keep(db, user.id, keep_id):
        raise HTTPException(status_code=404, detail="Keep rule not found")
    return {"ok": True}


@router.get("/{artist_name:path}", response_model=ArtistPage)
def get_artist(
    artist_name: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ArtistPage:
    name = unquote(artist_name).strip()
    if not name or len(name) > 256:
        raise HTTPException(status_code=400, detail="Invalid artist name")

    keep = known_ampersand_artists(db, user.id)

    rows = db.execute(
        select(Track, UserTrack.added_at, UserTrack.added_via)
        .join(UserTrack, UserTrack.track_id == Track.id)
        .where(UserTrack.user_id == user.id)
        .order_by(Track.title)
    ).all()

    matched: list[tuple[Track, object, str | None]] = [
        (track, added_at, added_via)
        for track, added_at, added_via in rows
        if any(_norm(a) == _norm(name) for a in split_artists(track.artist, known_exact=keep))
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
            is_liked_playlist=bool(getattr(p, "is_liked_playlist", False)),
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
        for part in split_artists(t.artist, known_exact=keep):
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
