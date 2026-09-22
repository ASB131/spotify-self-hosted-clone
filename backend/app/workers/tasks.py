"""Async download, Spotify sync, and quality upgrade tasks."""

import logging
import shutil
from pathlib import Path

from sqlalchemy import select

from app.database import SessionLocal
from app.models.discovery import DiscoveryItem, DiscoveryItemStatus
from app.models.download_job import DownloadJob, JobStatus
from app.models.track import AudioFormat, Track, TrackSource
from app.models.user import User
from app.services.events import publish_user_event
from app.services.integrations import lidarr_settings
from app.services.job_progress import update_job
from app.services.library import get_or_link_track
from app.services.lidarr_client import LidarrClient
from app.workers.celery_app import celery_app
from app.workers.download_util import download_youtube_audio, extract_youtube_id, persist_download
from app.workers.spotify_auth import ensure_spotify_access_token

logger = logging.getLogger(__name__)


def _notify(user_id: int, event: str, data: dict) -> None:
    publish_user_event(user_id, event, data)


def _link_discovery_item(db, discovery_item_id: int | None, track_id: int, via: str = "youtube") -> None:
    if not discovery_item_id:
        return
    item = db.get(DiscoveryItem, discovery_item_id)
    if not item:
        return
    item.track_id = track_id
    item.status = DiscoveryItemStatus.READY
    item.acquire_via = via
    item.error = None
    db.add(item)


def _fail_discovery_item(db, discovery_item_id: int | None, error: str) -> None:
    if not discovery_item_id:
        return
    item = db.get(DiscoveryItem, discovery_item_id)
    if not item:
        return
    item.status = DiscoveryItemStatus.FAILED
    item.error = error[:1000]
    db.add(item)


@celery_app.task(name="app.workers.tasks.download_youtube_track", bind=True, max_retries=3)
def download_youtube_track(
    self,
    user_id: int,
    url: str,
    title: str | None,
    artist: str | None,
    audio_format: str,
    playlist_id: int | None,
    add_to_liked: bool,
    job_id: int | None = None,
    discovery_item_id: int | None = None,
):
    db = SessionLocal()
    tmp_dir = None
    try:
        if job_id is None:
            job = DownloadJob(
                user_id=user_id,
                celery_task_id=self.request.id,
                url=url,
                title=title,
                artist=artist,
                audio_format=audio_format,
                status=JobStatus.QUEUED,
                progress=0,
                stage="Queued",
            )
            db.add(job)
            db.commit()
            db.refresh(job)
            job_id = job.id
        else:
            job = db.get(DownloadJob, job_id)
            if job and not job.celery_task_id:
                job.celery_task_id = self.request.id
                db.add(job)
                db.commit()
            if job and discovery_item_id is None:
                discovery_item_id = job.discovery_item_id

        update_job(db, job_id, status=JobStatus.RUNNING, progress=5, stage="Checking library…")

        # ytsearch URLs: resolve via yt-dlp (extract_youtube_id may fail — allow ytsearch)
        video_id = extract_youtube_id(url)
        if not video_id and not url.startswith("ytsearch"):
            raise ValueError("Invalid YouTube URL")

        source_key = f"youtube:{video_id}" if video_id else None
        existing = db.scalar(select(Track).where(Track.source_key == source_key)) if source_key else None
        if existing:
            update_job(db, job_id, progress=80, stage="Already on server — linking to your library…")
            get_or_link_track(
                db,
                user_id,
                existing,
                playlist_id=playlist_id,
                add_to_liked=add_to_liked,
            )
            _link_discovery_item(db, discovery_item_id, existing.id, via="youtube")
            db.commit()
            update_job(
                db,
                job_id,
                status=JobStatus.COMPLETED,
                progress=100,
                stage="Done (shared existing file)",
                track_id=existing.id,
                title=existing.title,
                artist=existing.artist,
            )
            _notify(
                user_id,
                "download_complete",
                {"track_id": existing.id, "job_id": job_id, "deduplicated": True},
            )
            return {"track_id": existing.id, "deduplicated": True, "job_id": job_id}

        update_job(
            db,
            job_id,
            progress=15,
            stage="Downloading from YouTube (this can take a minute)…",
            title=title,
            artist=artist,
        )
        meta, audio_path, thumb = download_youtube_audio(url, audio_format, title, artist)
        tmp_dir = audio_path.parent
        update_job(
            db,
            job_id,
            progress=70,
            stage="Saving file and album art…",
            title=meta.get("title") or title,
            artist=meta.get("artist") or artist,
        )
        (
            source_key,
            relative,
            size,
            art_rel,
            fmt,
            source,
            source_url,
        ) = persist_download(meta, audio_path, thumb, audio_format)

        track = Track(
            source_key=source_key,
            source=source,
            source_url=source_url,
            title=meta["title"],
            artist=meta["artist"],
            duration_seconds=meta.get("duration"),
            relative_path=relative,
            format=fmt,
            file_size_bytes=size,
            art_relative_path=art_rel,
        )
        db.add(track)
        db.flush()
        update_job(db, job_id, progress=90, stage="Adding to your library…")
        get_or_link_track(db, user_id, track, playlist_id=playlist_id, add_to_liked=add_to_liked)
        _link_discovery_item(db, discovery_item_id, track.id, via="youtube")
        db.commit()
        update_job(
            db,
            job_id,
            status=JobStatus.COMPLETED,
            progress=100,
            stage="Download complete",
            track_id=track.id,
            title=track.title,
            artist=track.artist,
        )
        _notify(user_id, "download_complete", {"track_id": track.id, "job_id": job_id, "deduplicated": False})
        return {"track_id": track.id, "job_id": job_id}
    except Exception as exc:
        db.rollback()
        logger.exception("download_youtube_track failed")
        if job_id:
            try:
                update_job(
                    db,
                    job_id,
                    status=JobStatus.FAILED,
                    progress=0,
                    stage="Failed — will retry if attempts remain",
                    error=str(exc),
                )
                _fail_discovery_item(db, discovery_item_id, str(exc))
                db.commit()
            except Exception:
                pass
        _notify(user_id, "download_failed", {"error": str(exc), "url": url, "job_id": job_id})
        raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1))
    finally:
        db.close()
        if tmp_dir and tmp_dir.exists():
            shutil.rmtree(tmp_dir, ignore_errors=True)


@celery_app.task(name="app.workers.tasks.acquire_discovery_item", bind=True, max_retries=1)
def acquire_discovery_item(self, user_id: int, item_id: int, prefer_lidarr: bool = True):
    """Try Lidarr grab; fall back to YouTube ytsearch."""
    db = SessionLocal()
    try:
        item = db.get(DiscoveryItem, item_id)
        if not item:
            return {"status": "missing"}
        if item.status == DiscoveryItemStatus.READY and item.track_id:
            return {"status": "ready", "track_id": item.track_id}

        lidarr_ok = False
        if prefer_lidarr:
            lid = lidarr_settings(db)
            client = LidarrClient(lid)
            if client.health():
                item.acquire_via = "lidarr"
                item.status = DiscoveryItemStatus.DOWNLOADING
                db.add(item)
                db.commit()
                album = client.ensure_album(
                    release_mbid=item.release_mbid,
                    artist_name=item.artist,
                    album_name=item.album or item.title,
                )
                if album:
                    lidarr_ok = True
                    # Lidarr grabs are async in the download client; fall through to YouTube
                    # for immediate library playback while Lidarr works in parallel.
                    _notify(
                        user_id,
                        "download_progress",
                        {
                            "stage": "Queued in Lidarr — also fetching via YouTube for playback",
                            "discovery_item_id": item_id,
                        },
                    )

        # Always ensure Resonance has a playable file via YouTube (Lidarr import can replace later)
        url = f"ytsearch1:{item.artist} - {item.title}"
        item.acquire_via = "lidarr+youtube" if lidarr_ok else "youtube"
        db.add(item)
        db.commit()
        job = DownloadJob(
            user_id=user_id,
            url=url,
            title=item.title,
            artist=item.artist,
            audio_format="flac",
            status=JobStatus.QUEUED,
            progress=0,
            stage="Queued — YouTube" + (" (Lidarr also searching)" if lidarr_ok else ""),
            discovery_item_id=item.id,
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        task = download_youtube_track.delay(
            user_id=user_id,
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
        return {"status": "queued", "job_id": job.id, "lidarr": lidarr_ok}
    except Exception as exc:
        logger.exception("acquire_discovery_item failed")
        try:
            _fail_discovery_item(db, item_id, str(exc))
            db.commit()
        except Exception:
            db.rollback()
        raise
    finally:
        db.close()


@celery_app.task(name="app.workers.tasks.refresh_user_discovery_task")
def refresh_user_discovery_task(user_id: int):
    from app.services.discovery_builder import refresh_user_discovery

    db = SessionLocal()
    try:
        return refresh_user_discovery(db, user_id)
    finally:
        db.close()


@celery_app.task(name="app.workers.tasks.refresh_all_discovery")
def refresh_all_discovery():
    from app.services.discovery_builder import refresh_all_users_discovery

    refresh_all_users_discovery()
    return {"ok": True}


@celery_app.task(name="app.workers.tasks.upgrade_track_quality")
def upgrade_track_quality(user_id: int, track_id: int):
    db = SessionLocal()
    tmp_dir = None
    try:
        track = db.get(Track, track_id)
        if not track or track.format == AudioFormat.FLAC:
            return {"status": "skipped"}

        if not track.source_url or track.source != TrackSource.YOUTUBE:
            _notify(user_id, "upgrade_failed", {"track_id": track_id, "error": "No YouTube source"})
            return {"status": "no_source"}

        old_size = track.file_size_bytes
        old_rel = track.relative_path

        meta, audio_path, thumb = download_youtube_audio(
            track.source_url, "flac", track.title, track.artist
        )
        tmp_dir = audio_path.parent
        (
            source_key,
            relative,
            size,
            art_rel,
            fmt,
            _source,
            _url,
        ) = persist_download(meta, audio_path, thumb, "flac")

        from app.services.track_cleanup import adjust_user_storage

        track.relative_path = relative
        track.format = fmt
        track.file_size_bytes = size
        track.art_relative_path = art_rel
        db.add(track)
        delta = size - old_size
        adjust_user_storage(db, user_id, delta)
        db.commit()

        from app.services.storage_paths import track_file_path

        try:
            old_path = track_file_path(old_rel)
            if old_path.is_file():
                old_path.unlink()
        except (ValueError, OSError) as exc:
            logger.warning("Could not remove old file: %s", exc)

        _notify(user_id, "upgrade_complete", {"track_id": track_id})
        return {"status": "upgraded", "track_id": track_id}
    except Exception as exc:
        db.rollback()
        logger.exception("upgrade failed")
        _notify(user_id, "upgrade_failed", {"track_id": track_id, "error": str(exc)})
        raise
    finally:
        db.close()
        if tmp_dir and tmp_dir.exists():
            shutil.rmtree(tmp_dir, ignore_errors=True)


@celery_app.task(name="app.workers.tasks.sync_all_spotify_libraries")
def sync_all_spotify_libraries():
    db = SessionLocal()
    try:
        users = db.scalars(select(User).where(User.spotify_refresh_token.isnot(None))).all()
        for user in users:
            sync_spotify_for_user.delay(user.id)
    finally:
        db.close()


@celery_app.task(name="app.workers.tasks.sync_spotify_for_user")
def sync_spotify_for_user(user_id: int):
    import httpx

    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if not user:
            return
        token = ensure_spotify_access_token(db, user)
        if not token:
            return

        headers = {"Authorization": f"Bearer {token}"}
        offset = 0
        limit = 50
        missing = []

        with httpx.Client(timeout=30) as client:
            while True:
                resp = client.get(
                    "https://api.spotify.com/v1/me/tracks",
                    headers=headers,
                    params={"limit": limit, "offset": offset},
                )
                if resp.status_code == 429:
                    logger.warning("Spotify rate limited for user %s", user_id)
                    break
                if resp.status_code != 200:
                    logger.error("Spotify library fetch failed: %s", resp.text)
                    break
                payload = resp.json()
                for item in payload.get("items", []):
                    track_obj = item.get("track") or {}
                    sid = track_obj.get("id")
                    if not sid:
                        continue
                    key = f"spotify:{sid}"
                    exists = db.scalar(select(Track).where(Track.source_key == key))
                    if not exists:
                        missing.append(
                            {
                                "spotify_id": sid,
                                "title": track_obj.get("name"),
                                "artist": ", ".join(a["name"] for a in track_obj.get("artists", [])),
                                "external_url": (track_obj.get("external_urls") or {}).get("spotify"),
                            }
                        )
                if not payload.get("next"):
                    break
                offset += limit

        for item in missing[:20]:
            search_q = f"{item['artist']} {item['title']}"
            yt_url = _search_youtube_for_query(search_q)
            if yt_url:
                job = DownloadJob(
                    user_id=user_id,
                    url=yt_url,
                    title=item["title"],
                    artist=item["artist"],
                    audio_format="mp3",
                    status=JobStatus.QUEUED,
                    progress=0,
                    stage="Queued from Spotify sync",
                )
                db.add(job)
                db.commit()
                db.refresh(job)
                task = download_youtube_track.delay(
                    user_id=user_id,
                    url=yt_url,
                    title=item["title"],
                    artist=item["artist"],
                    audio_format="mp3",
                    playlist_id=None,
                    add_to_liked=True,
                    job_id=job.id,
                )
                job.celery_task_id = task.id
                db.add(job)
                db.commit()
        _notify(user_id, "spotify_sync", {"queued": len(missing[:20])})
    finally:
        db.close()


def _ytdlp_cookie_path() -> str | None:
    """Writable cookie copy for yt-dlp (source mount is often read-only)."""
    from app.workers.download_util import _writable_cookiefile

    return _writable_cookiefile()


def _search_youtube_for_query(query: str) -> str | None:
    """Best-effort YouTube search via yt-dlp (no API key)."""
    import yt_dlp

    opts = {"quiet": True, "extract_flat": True, "skip_download": True}
    cookies = _ytdlp_cookie_path()
    if cookies:
        opts["cookiefile"] = cookies
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"ytsearch1:{query}", download=False)
        entries = info.get("entries") or []
        if entries:
            vid = entries[0].get("id")
            if vid:
                return f"https://www.youtube.com/watch?v={vid}"
    except Exception as exc:
        logger.warning("YouTube search failed: %s", exc)
    return None
