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


def _discovery_added_via(db, discovery_item_id: int | None) -> str:
    if not discovery_item_id:
        return "library"
    from app.models.discovery import DiscoveryPlaylist

    item = db.get(DiscoveryItem, discovery_item_id)
    if not item:
        return "library"
    pl = db.get(DiscoveryPlaylist, item.playlist_id)
    if not pl:
        return "library"
    kind = pl.kind.value if hasattr(pl.kind, "value") else str(pl.kind)
    return kind


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
    added_via: str | None = None,
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
                discovery_item_id=discovery_item_id,
                added_via=added_via,
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
            if job and not added_via:
                added_via = job.added_via

        via = (
            _discovery_added_via(db, discovery_item_id)
            if discovery_item_id
            else (added_via or "library")
        )

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
                added_via=via,
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
        try:
            from app.services.artist_normalize import normalize_for_library

            meta["artist"] = normalize_for_library(meta.get("artist") or artist, db, user_id)
        except Exception:
            logger.exception("artist normalize failed")
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
            duration_seconds=int(meta["duration"]) if meta.get("duration") is not None else None,
            relative_path=relative,
            format=fmt,
            file_size_bytes=size,
            art_relative_path=art_rel,
        )
        db.add(track)
        db.flush()
        update_job(db, job_id, progress=90, stage="Adding to your library…")
        get_or_link_track(
            db,
            user_id,
            track,
            playlist_id=playlist_id,
            add_to_liked=add_to_liked,
            added_via=via,
        )
        _link_discovery_item(db, discovery_item_id, track.id, via="youtube")
        # Backfill duration on discovery item
        if discovery_item_id and track.duration_seconds:
            di = db.get(DiscoveryItem, discovery_item_id)
            if di and not di.duration_ms:
                di.duration_ms = int(track.duration_seconds) * 1000
                db.add(di)
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


@celery_app.task(
    name="app.workers.tasks.acquire_discovery_item",
    bind=True,
    max_retries=1,
    soft_time_limit=900,
    time_limit=960,
)
def acquire_discovery_item(self, user_id: int, item_id: int, prefer_lidarr: bool = True):
    """
    Prefer Lidarr (torrent) when configured and healthy — no YouTube mix results.
    Fall back to a stricter YouTube search only when Lidarr is unavailable.
    """
    from app.services.lidarr_import import import_lidarr_track

    db = SessionLocal()
    try:
        item = db.get(DiscoveryItem, item_id)
        if not item:
            return {"status": "missing"}
        if item.status == DiscoveryItemStatus.READY and item.track_id:
            return {"status": "ready", "track_id": item.track_id}

        lid = lidarr_settings(db)
        client = LidarrClient(lid)
        lidarr_ready = prefer_lidarr and client.health()

        if lidarr_ready:
            item.acquire_via = "lidarr"
            item.status = DiscoveryItemStatus.DOWNLOADING
            db.add(item)
            db.commit()
            _notify(
                user_id,
                "download_progress",
                {"stage": "Searching Lidarr / torrent indexers…", "discovery_item_id": item_id},
            )
            album = client.ensure_album(
                release_mbid=item.release_mbid,
                artist_name=item.artist,
                album_name=item.album or item.title,
            )
            if album:
                _notify(
                    user_id,
                    "download_progress",
                    {
                        "stage": "Waiting for Lidarr import (torrent)…",
                        "discovery_item_id": item_id,
                    },
                )
                tf = client.wait_for_track_file(
                    title=item.title,
                    artist=item.artist,
                    album=album,
                    timeout_sec=720,
                    poll_sec=20,
                )
                if tf and tf.get("path"):
                    rel = client.path_to_relative(tf["path"])
                    if rel:
                        track = import_lidarr_track(
                            db,
                            user_id,
                            relative_path=rel,
                            title=item.title,
                            artist=item.artist,
                            album=item.album,
                            lidarr_file_id=tf.get("id"),
                            recording_mbid=item.recording_mbid,
                            added_via="lidarr",
                        )
                        _link_discovery_item(db, item_id, track.id, via="lidarr")
                        db.commit()
                        _notify(
                            user_id,
                            "download_complete",
                            {"track_id": track.id, "discovery_item_id": item_id, "via": "lidarr"},
                        )
                        return {"status": "ready", "track_id": track.id, "via": "lidarr"}
                    logger.warning(
                        "Lidarr file not under /music shared volume: %s", tf.get("path")
                    )
                    _fail_discovery_item(
                        db,
                        item_id,
                        "Lidarr downloaded a file but it is not under the shared /music folder. "
                        "Set Lidarr root folder to /music.",
                    )
                    db.commit()
                    return {"status": "failed", "error": "path mapping"}
            # Lidarr configured but could not fulfill — fail clearly (no YouTube mix)
            _fail_discovery_item(
                db,
                item_id,
                "Lidarr could not find/import this release. Check indexers, qBittorrent, and root folder /music.",
            )
            db.commit()
            return {"status": "failed", "via": "lidarr"}

        # YouTube fallback only when Lidarr is not in play
        url = _youtube_search_url(item.artist, item.title)
        item.acquire_via = "youtube"
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
            stage="Queued — YouTube (Lidarr not configured)",
            discovery_item_id=item.id,
            added_via="youtube",
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
        return {"status": "queued", "job_id": job.id, "lidarr": False}
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


def _youtube_search_url(artist: str, title: str) -> str:
    """Prefer official audio; exclude common mix/live traps."""
    q = f'"{title}" "{artist}" official audio -mix -remix -mashup -live -bootleg -DJ'
    return f"ytsearch1:{q}"


@celery_app.task(
    name="app.workers.tasks.acquire_catalog_recording",
    bind=True,
    soft_time_limit=900,
    time_limit=960,
)
def acquire_catalog_recording(
    self,
    user_id: int,
    title: str,
    artist: str,
    album: str | None = None,
    recording_mbid: str | None = None,
    release_mbid: str | None = None,
    job_id: int | None = None,
):
    """Download a catalog (MusicBrainz) recording via Lidarr, else YouTube."""
    from app.services.lidarr_import import import_lidarr_track

    db = SessionLocal()
    try:
        if job_id:
            update_job(db, job_id, status=JobStatus.RUNNING, progress=5, stage="Starting…")
        lid = lidarr_settings(db)
        client = LidarrClient(lid)
        if client.health():
            if job_id:
                update_job(db, job_id, progress=15, stage="Lidarr album search…")
            album_info = client.ensure_album(
                release_mbid=release_mbid,
                artist_name=artist,
                album_name=album or title,
            )
            if album_info:
                if job_id:
                    update_job(db, job_id, progress=40, stage="Waiting for torrent import…")
                tf = client.wait_for_track_file(
                    title=title, artist=artist, album=album_info, timeout_sec=720, poll_sec=20
                )
                if tf and tf.get("path"):
                    rel = client.path_to_relative(tf["path"])
                    if rel:
                        track = import_lidarr_track(
                            db,
                            user_id,
                            relative_path=rel,
                            title=title,
                            artist=artist,
                            album=album,
                            lidarr_file_id=tf.get("id"),
                            recording_mbid=recording_mbid,
                            added_via="lidarr",
                        )
                        db.commit()
                        if job_id:
                            update_job(
                                db,
                                job_id,
                                status=JobStatus.COMPLETED,
                                progress=100,
                                stage="Done (Lidarr)",
                                track_id=track.id,
                                title=track.title,
                                artist=track.artist,
                            )
                        _notify(user_id, "download_complete", {"track_id": track.id, "via": "lidarr"})
                        return {"status": "ready", "track_id": track.id, "via": "lidarr"}
            if job_id:
                update_job(
                    db,
                    job_id,
                    status=JobStatus.FAILED,
                    progress=100,
                    stage="Lidarr failed",
                    error="Lidarr could not import this recording",
                )
            return {"status": "failed", "via": "lidarr"}

        url = _youtube_search_url(artist, title)
        job = None
        if job_id:
            job = db.get(DownloadJob, job_id)
        if not job:
            job = DownloadJob(
                user_id=user_id,
                url=url,
                title=title,
                artist=artist,
                audio_format="flac",
                status=JobStatus.QUEUED,
                progress=0,
                stage="Queued — YouTube",
                added_via="youtube",
            )
            db.add(job)
            db.commit()
            db.refresh(job)
            job_id = job.id
        else:
            job.url = url
            db.add(job)
            db.commit()
        task = download_youtube_track.delay(
            user_id=user_id,
            url=url,
            title=title,
            artist=artist,
            audio_format="flac",
            playlist_id=None,
            add_to_liked=True,
            job_id=job_id,
            discovery_item_id=None,
        )
        job = db.get(DownloadJob, job_id)
        if job:
            job.celery_task_id = task.id
            db.add(job)
            db.commit()
        return {"status": "queued", "job_id": job_id, "via": "youtube"}
    except Exception as exc:
        logger.exception("acquire_catalog_recording failed")
        if job_id:
            try:
                update_job(db, job_id, status=JobStatus.FAILED, stage="Failed", error=str(exc))
            except Exception:
                pass
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


@celery_app.task(name="app.workers.tasks.convert_track_format")
def convert_track_format(user_id: int, track_id: int, target_format: str):
    """Convert between mp3 and flac using ffmpeg (local file)."""
    import subprocess
    from app.config import get_settings
    from app.services.storage_paths import new_track_relative_path, track_file_path
    from app.services.track_cleanup import adjust_user_storage

    target_format = target_format.lower()
    if target_format not in ("mp3", "flac"):
        return {"status": "invalid_format"}

    db = SessionLocal()
    try:
        track = db.get(Track, track_id)
        if not track:
            return {"status": "missing"}
        current = track.format.value if hasattr(track.format, "value") else str(track.format)
        if current == target_format:
            return {"status": "already", "format": current}

        src = track_file_path(track.relative_path)
        if not src.is_file():
            _notify(user_id, "upgrade_failed", {"track_id": track_id, "error": "File missing"})
            return {"status": "missing_file"}

        settings = get_settings()
        ffmpeg = settings.ffmpeg_path or "ffmpeg"
        new_rel = new_track_relative_path(track.artist, track.title, target_format)
        dest = track_file_path(new_rel)
        dest.parent.mkdir(parents=True, exist_ok=True)

        if target_format == "mp3":
            cmd = [ffmpeg, "-y", "-i", str(src), "-codec:a", "libmp3lame", "-q:a", "0", str(dest)]
        else:
            cmd = [ffmpeg, "-y", "-i", str(src), "-codec:a", "flac", str(dest)]

        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0 or not dest.is_file():
            err = (proc.stderr or proc.stdout or "ffmpeg failed")[:500]
            _notify(user_id, "upgrade_failed", {"track_id": track_id, "error": err})
            return {"status": "failed", "error": err}

        old_size = track.file_size_bytes
        old_rel = track.relative_path
        new_size = dest.stat().st_size
        track.relative_path = new_rel
        track.format = AudioFormat.MP3 if target_format == "mp3" else AudioFormat.FLAC
        track.file_size_bytes = new_size
        db.add(track)
        adjust_user_storage(db, user_id, new_size - old_size)
        db.commit()

        try:
            old_path = track_file_path(old_rel)
            if old_path.is_file() and old_path != dest:
                old_path.unlink()
        except (ValueError, OSError):
            pass

        _notify(user_id, "upgrade_complete", {"track_id": track_id, "format": target_format})
        return {"status": "converted", "format": target_format, "file_size_bytes": new_size}
    except Exception as exc:
        db.rollback()
        logger.exception("convert_track_format failed")
        _notify(user_id, "upgrade_failed", {"track_id": track_id, "error": str(exc)})
        raise
    finally:
        db.close()


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
                    added_via="spotify",
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
                    added_via="spotify",
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

    opts = {
        "quiet": True,
        "extract_flat": True,
        "skip_download": True,
        "js_runtimes": {"deno": {}},
    }
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
