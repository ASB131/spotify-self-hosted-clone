"""Catalog search (MusicBrainz) + download via Lidarr/YouTube."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.download_job import DownloadJob, JobStatus
from app.models.user import User
from app.services import listenbrainz as lb
from app.services import musicbrainz as mb
from app.services.integrations import lidarr_settings
from app.services.lidarr_client import LidarrClient

router = APIRouter(prefix="/catalog", tags=["catalog"])


class CatalogArtistHit(BaseModel):
    mbid: str
    name: str
    disambiguation: str | None = None
    type: str | None = None
    score: int | None = None


class CatalogRecordingHit(BaseModel):
    recording_mbid: str
    title: str
    artist: str
    artist_mbid: str | None = None
    album: str | None = None
    release_mbid: str | None = None
    duration_ms: int | None = None
    score: int | None = None
    art_url: str | None = None


class CatalogSearchResponse(BaseModel):
    query: str
    artists: list[CatalogArtistHit]
    recordings: list[CatalogRecordingHit]
    listenbrainz_ok: bool
    musicbrainz_ok: bool


class CatalogArtistPage(BaseModel):
    mbid: str
    name: str
    disambiguation: str | None = None
    tags: list[str] = []
    releases: list[dict] = []


class CatalogRecordingPage(BaseModel):
    recording_mbid: str
    title: str
    artist: str
    artist_mbid: str | None = None
    album: str | None = None
    release_mbid: str | None = None
    duration_ms: int | None = None
    art_url: str | None = None


class CatalogDownloadRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    artist: str = Field(..., min_length=1, max_length=512)
    album: str | None = None
    recording_mbid: str | None = None
    release_mbid: str | None = None


@router.get("/search", response_model=CatalogSearchResponse)
def catalog_search(q: str, user: User = Depends(get_current_user)):
    term = (q or "").strip()
    if len(term) < 2:
        raise HTTPException(status_code=400, detail="Query too short")
    artists_raw = mb.search_artists(term, limit=8)
    recordings_raw = mb.search_recordings(term, limit=20)
    mb_ok = bool(artists_raw or recordings_raw)
    lb_ok = False
    try:
        fr = lb.fresh_releases(days=1)
        lb_ok = isinstance(fr, list)
    except Exception:
        lb_ok = False

    recordings = [
        CatalogRecordingHit(
            recording_mbid=r["recording_mbid"],
            title=r["title"],
            artist=r["artist"],
            artist_mbid=r.get("artist_mbid"),
            album=r.get("album"),
            release_mbid=r.get("release_mbid"),
            duration_ms=r.get("duration_ms"),
            score=r.get("score"),
            art_url=mb.cover_art_url(r.get("release_mbid")),
        )
        for r in recordings_raw
        if r.get("recording_mbid")
    ]
    artists = [
        CatalogArtistHit(
            mbid=a["mbid"],
            name=a["name"],
            disambiguation=a.get("disambiguation"),
            type=a.get("type"),
            score=a.get("score"),
        )
        for a in artists_raw
        if a.get("mbid")
    ]
    return CatalogSearchResponse(
        query=term,
        artists=artists,
        recordings=recordings,
        listenbrainz_ok=lb_ok,
        musicbrainz_ok=bool(artists or recordings) or mb_ok,
    )


@router.get("/artists/{mbid}", response_model=CatalogArtistPage)
def catalog_artist(mbid: str, user: User = Depends(get_current_user)):
    data = mb.artist_lookup(mbid)
    if not data:
        raise HTTPException(status_code=404, detail="Artist not found")
    tags = [t["name"] for t in (data.get("tags") or []) if t.get("name")][:12]
    rgs = mb.artist_release_groups(mbid, limit=40)
    releases = []
    for rg in rgs:
        releases.append(
            {
                "id": rg.get("id"),
                "title": rg.get("title"),
                "first_release_date": rg.get("first-release-date"),
                "primary_type": rg.get("primary-type"),
                "art_url": mb.cover_art_url(release_group_mbid=rg.get("id")),
            }
        )
    return CatalogArtistPage(
        mbid=mbid,
        name=data.get("name") or "Unknown",
        disambiguation=data.get("disambiguation"),
        tags=tags,
        releases=releases,
    )


@router.get("/artists/{mbid}/tracks")
def catalog_artist_tracks(mbid: str, user: User = Depends(get_current_user)):
    """Sample tracks from recent release groups for download."""
    rgs = mb.artist_release_groups(mbid, limit=12)
    artist = mb.artist_lookup(mbid)
    artist_name = (artist or {}).get("name") or "Unknown"
    tracks: list[dict] = []
    seen: set[str] = set()
    for rg in rgs:
        rel_mbid = mb.release_group_first_release_mbid(rg.get("id") or "")
        if not rel_mbid:
            continue
        for t in mb.release_tracklist(rel_mbid)[:4]:
            key = (t.get("recording_mbid") or "") + (t.get("title") or "")
            if key in seen:
                continue
            seen.add(key)
            t = dict(t)
            t.setdefault("artist", artist_name)
            t["artist_mbid"] = mbid
            t["art_url"] = mb.cover_art_url(t.get("release_mbid") or rel_mbid)
            tracks.append(t)
            if len(tracks) >= 40:
                return {"artist": artist_name, "mbid": mbid, "tracks": tracks}
    return {"artist": artist_name, "mbid": mbid, "tracks": tracks}


@router.get("/recordings/{mbid}", response_model=CatalogRecordingPage)
def catalog_recording(mbid: str, user: User = Depends(get_current_user)):
    data = mb.recording_lookup(mbid)
    if not data:
        raise HTTPException(status_code=404, detail="Recording not found")
    credit = data.get("artist-credit") or []
    artist = " ".join(
        (c.get("name") or "") + (c.get("joinphrase") or "") for c in credit
    ).strip() or "Unknown Artist"
    artist_mbid = None
    if credit and isinstance(credit[0].get("artist"), dict):
        artist_mbid = credit[0]["artist"].get("id")
    releases = data.get("releases") or []
    album = releases[0].get("title") if releases else None
    release_mbid = releases[0].get("id") if releases else None
    return CatalogRecordingPage(
        recording_mbid=mbid,
        title=data.get("title") or "Unknown",
        artist=artist,
        artist_mbid=artist_mbid,
        album=album,
        release_mbid=release_mbid,
        duration_ms=data.get("length"),
        art_url=mb.cover_art_url(release_mbid),
    )


@router.post("/download")
def catalog_download(
    body: CatalogDownloadRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.workers.tasks import acquire_catalog_recording

    lid = lidarr_settings(db)
    via = "lidarr" if (lid.configured and LidarrClient(lid).health()) else "youtube"
    job = DownloadJob(
        user_id=user.id,
        url=f"catalog:{body.recording_mbid or body.title}",
        title=body.title,
        artist=body.artist,
        audio_format="flac",
        status=JobStatus.QUEUED,
        progress=0,
        stage=f"Queued — {via}",
        added_via=via,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    task = acquire_catalog_recording.delay(
        user.id,
        body.title,
        body.artist,
        body.album,
        body.recording_mbid,
        body.release_mbid,
        job.id,
    )
    job.celery_task_id = task.id
    db.add(job)
    db.commit()
    return {"status": "queued", "via": via, "job_id": job.id, "task_id": task.id}
