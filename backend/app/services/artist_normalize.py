"""MusicBrainz-aware artist credit normalization for downloads."""

from __future__ import annotations

import logging
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.artist_keep import ArtistKeep
from app.models.discovery import ArtistMbid
from app.models.track import Track
from app.models.user_track import UserTrack
from app.services import musicbrainz as mb
from app.services.artists import (
    KNOWN_AMPERSAND_ARTISTS,
    _PRIMARY_SPLIT,
    _norm,
    normalize_artist_credits,
    normalize_hyphens,
)

logger = logging.getLogger(__name__)


def known_ampersand_artists(db: Session | None, user_id: int | None = None) -> set[str]:
    """Normalized names that contain & and should stay as one artist."""
    keep: set[str] = set(KNOWN_AMPERSAND_ARTISTS)
    if db is None:
        return keep
    q = select(ArtistKeep)
    if user_id is not None:
        q = q.where(ArtistKeep.user_id == user_id)
    for row in db.scalars(q).all():
        keep.add(row.normalized_name)
        keep.add(_norm(row.display_name))
    rows = db.scalars(select(ArtistMbid).where(ArtistMbid.display_name.contains("&"))).all()
    for row in rows:
        keep.add(_norm(row.display_name))
        if row.normalized_name:
            keep.add(row.normalized_name)
    return keep


def _mb_exact_artist(name: str) -> bool:
    try:
        hit = mb.search_artist(name)
    except Exception:
        return False
    if not hit:
        return False
    return _norm(hit.get("name") or "") == _norm(name)


def resolve_keep_ampersand(name: str, db: Session | None = None, user_id: int | None = None) -> set[str]:
    keep = known_ampersand_artists(db, user_id)
    text = normalize_hyphens(name or "")
    chunks = [c.strip() for c in _PRIMARY_SPLIT.split(text) if c and c.strip()] or [text]
    for chunk in [text, *chunks]:
        if "&" not in chunk and "＆" not in chunk:
            continue
        if _norm(chunk) in keep:
            continue
        if _mb_exact_artist(chunk):
            keep.add(_norm(chunk))
            if db is not None:
                _cache_artist(db, chunk)
    return keep


def _cache_artist(db: Session, display: str) -> None:
    key = _norm(display)
    existing = db.scalar(select(ArtistMbid).where(ArtistMbid.normalized_name == key))
    if existing:
        return
    hit = mb.search_artist(display)
    mbid = hit.get("id") if hit else None
    tags = mb.artist_tags(mbid) if mbid else []
    db.add(
        ArtistMbid(
            normalized_name=key,
            display_name=normalize_hyphens(display),
            mbid=mbid,
            tags_json=mb.tags_json(tags) if tags else None,
        )
    )
    try:
        db.flush()
    except Exception:
        logger.exception("cache artist failed")


def normalize_for_library(
    artist_field: str | None,
    db: Session | None = None,
    user_id: int | None = None,
) -> str:
    """
    Canonical artist string for Track.artist:
    "Steve Aoki & Sub Zero Project" → "Steve Aoki, Sub Zero Project"
    "D‐Block & S‐te‐Fan X Phuture Noize" → "D-Block & S-te-Fan, Phuture Noize"
    """
    if not artist_field:
        return "Unknown Artist"
    keep = resolve_keep_ampersand(artist_field, db, user_id)
    return normalize_artist_credits(artist_field, known_exact=keep)


def apply_keep_to_user_library(db: Session, user_id: int, display_name: str) -> int:
    """
    Persist a keep rule and rewrite this user's track credits so the act stays one name.
    Also repairs mistaken 'Left, Right' when the keep name is 'Left & Right'.
    """
    display = normalize_hyphens(display_name)
    key = _norm(display)
    existing = db.scalar(
        select(ArtistKeep).where(ArtistKeep.user_id == user_id, ArtistKeep.normalized_name == key)
    )
    if not existing:
        db.add(ArtistKeep(user_id=user_id, normalized_name=key, display_name=display))
        db.flush()

    amp_parts = [p.strip() for p in re.split(r"\s*[&＆]\s*", display) if p.strip()]
    comma_form = ", ".join(amp_parts) if len(amp_parts) >= 2 else None

    tracks = db.scalars(
        select(Track)
        .join(UserTrack, UserTrack.track_id == Track.id)
        .where(UserTrack.user_id == user_id)
    ).all()
    keep = known_ampersand_artists(db, user_id)
    changed = 0
    for t in tracks:
        artist = t.artist or ""
        new = artist
        if comma_form:
            new = re.sub(re.escape(comma_form), display, new, flags=re.IGNORECASE)
        new = normalize_artist_credits(new, known_exact=keep)
        if new != (t.artist or ""):
            t.artist = new
            db.add(t)
            changed += 1
    db.commit()
    return changed


def remove_keep(db: Session, user_id: int, keep_id: int) -> bool:
    row = db.get(ArtistKeep, keep_id)
    if not row or row.user_id != user_id:
        return False
    db.delete(row)
    db.commit()
    return True
