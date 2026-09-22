"""Fuzzy search via PostgreSQL pg_trgm."""

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.playlist import Playlist
from app.models.track import Track
from app.models.user_track import UserTrack


def search_library(db: Session, user_id: int, query: str, limit: int = 20):
    q = query.strip()
    if len(q) < 2:
        return [], []

    track_ids = select(UserTrack.track_id).where(UserTrack.user_id == user_id)
    tracks = db.scalars(
        select(Track)
        .where(Track.id.in_(track_ids))
        .where(
            or_(
                func.similarity(Track.title, q) > 0.2,
                func.similarity(Track.artist, q) > 0.2,
                Track.title.ilike(f"%{q}%"),
                Track.artist.ilike(f"%{q}%"),
            )
        )
        .order_by(func.greatest(func.similarity(Track.title, q), func.similarity(Track.artist, q)).desc())
        .limit(limit)
    ).all()

    playlists = db.scalars(
        select(Playlist)
        .where(Playlist.user_id == user_id)
        .where(
            or_(
                func.similarity(Playlist.name, q) > 0.2,
                Playlist.name.ilike(f"%{q}%"),
            )
        )
        .order_by(func.similarity(Playlist.name, q).desc())
        .limit(limit)
    ).all()

    return tracks, playlists
