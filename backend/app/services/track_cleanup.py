"""Remove tracks from disk when no users reference them; update quotas."""

import logging
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.playlist import PlaylistTrack
from app.models.track import Track
from app.models.user import User
from app.models.user_track import UserTrack
from app.services.storage_paths import art_file_path, track_file_path

logger = logging.getLogger(__name__)


def track_refcount(db: Session, track_id: int) -> int:
    user_count = db.scalar(select(func.count()).select_from(UserTrack).where(UserTrack.track_id == track_id)) or 0
    playlist_count = (
        db.scalar(select(func.count()).select_from(PlaylistTrack).where(PlaylistTrack.track_id == track_id)) or 0
    )
    return user_count + playlist_count


def _delete_file(path: Path) -> None:
    try:
        if path.is_file():
            path.unlink()
    except OSError as exc:
        logger.warning("Failed to delete file %s: %s", path, exc)


def prune_empty_parents(path: Path, stop_at: Path) -> None:
    """Remove empty directories from path's parent up to (but not including) stop_at."""
    try:
        stop = stop_at.resolve()
        cur = path.parent.resolve()
    except OSError:
        return
    while cur != stop:
        try:
            if not cur.is_relative_to(stop):
                break
        except (AttributeError, TypeError, ValueError):
            break
        try:
            cur.rmdir()
        except OSError:
            break
        cur = cur.parent


def delete_track_files(track: Track) -> int:
    """Delete audio and art from disk; returns bytes freed."""
    from app.services.storage_paths import music_root

    freed = 0
    root = music_root()
    try:
        audio = track_file_path(track.relative_path)
        if audio.is_file():
            freed += audio.stat().st_size
            _delete_file(audio)
            prune_empty_parents(audio, root)
    except ValueError:
        pass
    if track.art_relative_path:
        try:
            art = art_file_path(track.art_relative_path)
            if art.is_file():
                freed += art.stat().st_size
                _delete_file(art)
                prune_empty_parents(art, root)
        except ValueError:
            pass
    return freed


def adjust_user_storage(db: Session, user_id: int, delta_bytes: int) -> None:
    user = db.get(User, user_id)
    if not user:
        return
    user.storage_used_bytes = max(0, user.storage_used_bytes + delta_bytes)
    db.add(user)


def remove_user_track_membership(db: Session, user_id: int, track_id: int) -> bool:
    """
    Remove user's link to a track; delete physical file and Track row if unreferenced.
    Returns True if the global track was deleted.
    """
    ut = db.scalar(
        select(UserTrack).where(UserTrack.user_id == user_id, UserTrack.track_id == track_id)
    )
    if not ut:
        return False

    track = db.get(Track, track_id)
    if not track:
        db.delete(ut)
        return False

    size = track.file_size_bytes
    from app.models.playlist import Playlist

    db.delete(ut)
    db.execute(
        PlaylistTrack.__table__.delete().where(
            PlaylistTrack.track_id == track_id,
            PlaylistTrack.playlist_id.in_(select(Playlist.id).where(Playlist.user_id == user_id)),
        )
    )
    db.flush()

    adjust_user_storage(db, user_id, -size)

    if track_refcount(db, track_id) == 0:
        delete_track_files(track)
        db.delete(track)
        return True
    return False
