"""Async download, Spotify sync, and quality upgrade tasks."""

import asyncio
import logging
import shutil
from pathlib import Path

from sqlalchemy import select

from app.database import SessionLocal
from app.models.track import AudioFormat, Track, TrackSource
from app.models.user import User
from app.services.library import get_or_link_track
from app.websocket.manager import ws_manager
from app.workers.celery_app import celery_app
from app.workers.download_util import download_youtube_audio, extract_youtube_id, persist_download
from app.workers.spotify_auth import ensure_spotify_access_token

logger = logging.getLogger(__name__)


def _notify(user_id: int, event: str, data: dict) -> None:
    try:
        asyncio.run(ws_manager.send_to_user(user_id, event, data))
    except Exception as exc:
        logger.debug("WS notify failed: %s", exc)


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
):
    db = SessionLocal()
    tmp_dir = None
    try:
        video_id = extract_youtube_id(url)
        if not video_id:
            raise ValueError("Invalid YouTube URL")

        source_key = f"youtube:{video_id}"
        existing = db.scalar(select(Track).where(Track.source_key == source_key))
        if existing:
            get_or_link_track(
                db,
                user_id,
                existing,
                playlist_id=playlist_id,
                add_to_liked=add_to_liked,
            )
            db.commit()
            _notify(user_id, "download_complete", {"track_id": existing.id, "deduplicated": True})
            return {"track_id": existing.id, "deduplicated": True}

        meta, audio_path, thumb = download_youtube_audio(url, audio_format, title, artist)
        tmp_dir = audio_path.parent
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
        get_or_link_track(db, user_id, track, playlist_id=playlist_id, add_to_liked=add_to_liked)
        db.commit()
        _notify(user_id, "download_complete", {"track_id": track.id, "deduplicated": False})
        return {"track_id": track.id}
    except Exception as exc:
        db.rollback()
        logger.exception("download_youtube_track failed")
        _notify(user_id, "download_failed", {"error": str(exc), "url": url})
        raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1))
    finally:
        db.close()
        if tmp_dir and tmp_dir.exists():
            shutil.rmtree(tmp_dir, ignore_errors=True)


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
                download_youtube_track.delay(
                    user_id=user_id,
                    url=yt_url,
                    title=item["title"],
                    artist=item["artist"],
                    audio_format="mp3",
                    playlist_id=None,
                    add_to_liked=True,
                )
        _notify(user_id, "spotify_sync", {"queued": len(missing[:20])})
    finally:
        db.close()


def _ytdlp_cookie_path() -> str:
    from app.config import get_settings

    return get_settings().ytdlp_cookies_path


def _search_youtube_for_query(query: str) -> str | None:
    """Best-effort YouTube search via yt-dlp (no API key)."""
    import yt_dlp

    opts = {"quiet": True, "extract_flat": True, "skip_download": True}
    cookies = _ytdlp_cookie_path()
    if Path(cookies).is_file():
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
