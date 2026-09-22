"""Attach users to existing tracks or create new ones with deduplication."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.playlist import Playlist, PlaylistTrack
from app.models.track import Track
from app.models.user import User
from app.models.user_track import UserTrack
from app.services.track_cleanup import adjust_user_storage


def get_or_link_track(
    db: Session,
    user_id: int,
    track: Track,
    *,
    playlist_id: int | None = None,
    add_to_liked: bool = True,
    added_via: str = "library",
) -> UserTrack:
    """Link user to track; charge storage only on first link for this user."""
    user = db.get(User, user_id)
    if not user:
        raise ValueError("User not found")

    existing = db.scalar(
        select(UserTrack).where(UserTrack.user_id == user_id, UserTrack.track_id == track.id)
    )
    if existing:
        ut = existing
        if added_via and added_via != "library" and (not ut.added_via or ut.added_via == "library"):
            ut.added_via = added_via
            db.add(ut)
    else:
        if user.storage_used_bytes + track.file_size_bytes > user.storage_quota_bytes:
            raise ValueError("Storage quota exceeded")
        ut = UserTrack(user_id=user_id, track_id=track.id, added_via=added_via or "library")
        db.add(ut)
        adjust_user_storage(db, user_id, track.file_size_bytes)

    # All Songs is the full library; categorized playlists are additional memberships.
    if add_to_liked or playlist_id:
        liked = db.scalar(
            select(Playlist).where(Playlist.user_id == user_id, Playlist.is_liked_songs.is_(True))
        )
        if liked:
            _add_to_playlist(db, liked.id, track.id)

    if playlist_id:
        pl = db.get(Playlist, playlist_id)
        if pl and pl.user_id == user_id and not pl.is_liked_songs:
            _add_to_playlist(db, playlist_id, track.id)

    db.flush()
    return ut


def _add_to_playlist(db: Session, playlist_id: int, track_id: int) -> None:
    exists = db.scalar(
        select(PlaylistTrack).where(
            PlaylistTrack.playlist_id == playlist_id, PlaylistTrack.track_id == track_id
        )
    )
    if exists:
        return
    max_pos = db.scalar(
        select(PlaylistTrack.position)
        .where(PlaylistTrack.playlist_id == playlist_id)
        .order_by(PlaylistTrack.position.desc())
        .limit(1)
    )
    pos = (max_pos or 0) + 1
    db.add(PlaylistTrack(playlist_id=playlist_id, track_id=track_id, position=pos))
