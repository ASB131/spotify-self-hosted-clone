"""Home feed, discovery playlists, play history, and on-demand acquire."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.discovery import (
    DiscoveryItem,
    DiscoveryItemStatus,
    DiscoveryKind,
    DiscoveryPlaylist,
    PlayEvent,
)
from app.models.user_track import UserTrack
from app.models.track import Track
from app.models.user import User
from app.models.playlist import Playlist
from app.models.download_job import DownloadJob, JobStatus
from app.schemas.auth import PlaylistPublic, TrackPublic
from app.services.discovery_builder import (
    get_or_create_discovery_playlist,
    week_key,
)
from app.services.integrations import lidarr_settings
from app.services.lidarr_client import LidarrClient
from app.workers.tasks import acquire_discovery_item, download_youtube_track

router = APIRouter(tags=["discovery"])


class DiscoveryItemPublic(BaseModel):
    id: int
    title: str
    artist: str
    album: Optional[str] = None
    duration_ms: Optional[int] = None
    status: str
    track_id: Optional[int] = None
    acquire_via: Optional[str] = None
    error: Optional[str] = None
    recording_mbid: Optional[str] = None
    release_mbid: Optional[str] = None
    art_url: Optional[str] = None
    position: int = 0


class DiscoveryPlaylistPublic(BaseModel):
    kind: str
    name: str
    description: str
    week_key: str
    item_count: int
    items: list[DiscoveryItemPublic] = []


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
    discover_weekly: DiscoveryPlaylistPublic
    release_radar: DiscoveryPlaylistPublic


class PlayCreate(BaseModel):
    track_id: int
    playlist_id: Optional[int] = None


KIND_META = {
    DiscoveryKind.DISCOVER_WEEKLY: (
        "Discover Weekly",
        "A mix of genres, popular picks, and deeper cuts — refreshed weekly.",
    ),
    DiscoveryKind.RELEASE_RADAR: (
        "Release Radar",
        "New releases from artists in your library — refreshed weekly.",
    ),
}


def _item_public(item: DiscoveryItem) -> DiscoveryItemPublic:
    art = None
    if item.track_id and item.track and item.track.art_relative_path:
        art = f"/api/v1/tracks/{item.track_id}/art"
    elif item.art_url:
        art = item.art_url
    return DiscoveryItemPublic(
        id=item.id,
        title=item.title,
        artist=item.artist,
        album=item.album,
        duration_ms=item.duration_ms,
        status=item.status.value if hasattr(item.status, "value") else str(item.status),
        track_id=item.track_id,
        acquire_via=item.acquire_via,
        error=item.error,
        recording_mbid=item.recording_mbid,
        release_mbid=item.release_mbid,
        art_url=art,
        position=item.position,
    )


def _playlist_public(pl: DiscoveryPlaylist, include_items: bool = True) -> DiscoveryPlaylistPublic:
    name, desc = KIND_META[pl.kind]
    items = sorted(pl.items, key=lambda x: x.position) if include_items else []
    # Prefer current week items
    wk = pl.week_key or week_key()
    week_items = [i for i in items if i.week_key == wk] or items
    return DiscoveryPlaylistPublic(
        kind=pl.kind.value if hasattr(pl.kind, "value") else str(pl.kind),
        name=name,
        description=desc,
        week_key=wk,
        item_count=len(week_items),
        items=[_item_public(i) for i in week_items] if include_items else [],
    )


def _ensure_loaded(db: Session, user_id: int, kind: DiscoveryKind) -> DiscoveryPlaylist:
    pl = get_or_create_discovery_playlist(db, user_id, kind)
    pl = db.scalar(
        select(DiscoveryPlaylist)
        .where(DiscoveryPlaylist.id == pl.id)
        .options(selectinload(DiscoveryPlaylist.items).selectinload(DiscoveryItem.track))
    )
    assert pl
    wk = week_key()
    if pl.week_key != wk or not pl.items:
        # Async refresh — do not block the homepage on MusicBrainz rate limits
        try:
            from app.workers.tasks import refresh_user_discovery_task

            refresh_user_discovery_task.delay(user_id)
        except Exception:
            pass
    return pl


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

    # Recently played tracks (unique, latest first)
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

    weekly = _ensure_loaded(db, user.id, DiscoveryKind.DISCOVER_WEEKLY)
    radar = _ensure_loaded(db, user.id, DiscoveryKind.RELEASE_RADAR)

    return HomeResponse(
        all_songs=all_songs,
        recently_played_tracks=recent_tracks,
        recently_played_playlists=recent_playlists,
        discover_weekly=_playlist_public(weekly),
        release_radar=_playlist_public(radar),
    )


@router.get("/discovery/{kind}", response_model=DiscoveryPlaylistPublic)
def get_discovery(kind: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        dk = DiscoveryKind(kind)
    except ValueError:
        raise HTTPException(status_code=404, detail="Unknown discovery playlist")
    pl = _ensure_loaded(db, user.id, dk)
    return _playlist_public(pl)


@router.post("/discovery/refresh")
def refresh_discovery(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.workers.tasks import refresh_user_discovery_task

    task = refresh_user_discovery_task.delay(user.id)
    return {"ok": True, "task_id": task.id, "status": "queued"}


@router.post("/discovery/items/{item_id}/download")
def download_discovery_item(
    item_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.get(DiscoveryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    pl = db.get(DiscoveryPlaylist, item.playlist_id)
    if not pl or pl.user_id != user.id:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.status == DiscoveryItemStatus.READY and item.track_id:
        return {"status": "ready", "track_id": item.track_id}
    if item.status == DiscoveryItemStatus.DOWNLOADING:
        return {"status": "downloading", "item_id": item.id}

    item.status = DiscoveryItemStatus.DOWNLOADING
    item.error = None
    db.add(item)
    db.commit()

    lid = lidarr_settings(db)
    use_lidarr = lid.configured and LidarrClient(lid).health()

    if use_lidarr:
        item.acquire_via = "lidarr"
        db.add(item)
        db.commit()
        task = acquire_discovery_item.delay(user.id, item.id, prefer_lidarr=True)
        return {"status": "queued", "via": "lidarr", "task_id": task.id}

    # YouTube fallback immediately
    item.acquire_via = "youtube"
    db.add(item)
    db.commit()
    url = f"ytsearch1:{item.artist} - {item.title}"
    job = DownloadJob(
        user_id=user.id,
        url=url,
        title=item.title,
        artist=item.artist,
        audio_format="flac",
        status=JobStatus.QUEUED,
        progress=0,
        stage="Queued — YouTube search",
        discovery_item_id=item.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    task = download_youtube_track.delay(
        user_id=user.id,
        url=url,
        title=item.title,
        artist=item.artist,
        audio_format="flac",
        playlist_id=None,
        add_to_liked=True,
        job_id=job.id,
        discovery_item_id=item.id,
    )
    job.celery_task_id = task.id
    db.add(job)
    db.commit()
    return {"status": "queued", "via": "youtube", "job_id": job.id, "task_id": task.id}


@router.post("/discovery/{kind}/download-all")
def download_all_discovery(
    kind: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        dk = DiscoveryKind(kind)
    except ValueError:
        raise HTTPException(status_code=404, detail="Unknown discovery playlist")
    pl = get_or_create_discovery_playlist(db, user.id, dk)
    items = db.scalars(
        select(DiscoveryItem).where(
            DiscoveryItem.playlist_id == pl.id,
            DiscoveryItem.status.in_(
                (DiscoveryItemStatus.AVAILABLE, DiscoveryItemStatus.FAILED)
            ),
        )
    ).all()
    queued = 0
    for item in items:
        if item.track_id and item.status == DiscoveryItemStatus.READY:
            continue
        item.status = DiscoveryItemStatus.DOWNLOADING
        item.error = None
        db.add(item)
        db.commit()
        acquire_discovery_item.delay(user.id, item.id, prefer_lidarr=True)
        queued += 1
    return {"queued": queued}


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
    # thin alias used by clients; home already aggregates
    rows = db.scalars(
        select(PlayEvent).where(PlayEvent.user_id == user.id).order_by(PlayEvent.played_at.desc()).limit(40)
    ).all()
    return [{"track_id": r.track_id, "playlist_id": r.playlist_id, "played_at": r.played_at} for r in rows]
