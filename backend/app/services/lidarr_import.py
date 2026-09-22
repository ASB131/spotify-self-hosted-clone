"""Import a Lidarr-managed file into the Resonance track library."""

from __future__ import annotations

import logging
from pathlib import Path

from mutagen.flac import FLAC
from mutagen.mp3 import MP3
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.track import AudioFormat, Track, TrackSource
from app.services.artist_normalize import normalize_for_library
from app.services.library import get_or_link_track
from app.services.storage_paths import music_root, track_file_path

logger = logging.getLogger(__name__)


def import_lidarr_track(
    db: Session,
    user_id: int,
    *,
    relative_path: str,
    title: str,
    artist: str,
    album: str | None,
    lidarr_file_id: int | None,
    recording_mbid: str | None = None,
    added_via: str = "lidarr",
) -> Track:
    key = (
        f"lidarr:rec:{recording_mbid}"
        if recording_mbid
        else f"lidarr:file:{lidarr_file_id or relative_path}"
    )
    existing = db.scalar(select(Track).where(Track.source_key == key))
    if existing:
        get_or_link_track(db, user_id, existing, add_to_liked=True, added_via=added_via)
        return existing

    full = track_file_path(relative_path)
    if not full.is_file():
        raise FileNotFoundError(f"Lidarr file missing: {relative_path}")

    ext = full.suffix.lower().lstrip(".")
    fmt = AudioFormat.FLAC if ext == "flac" else AudioFormat.MP3
    size = full.stat().st_size
    duration = _duration_seconds(full, ext)
    artist_n = normalize_for_library(artist, db, user_id)

    track = Track(
        source_key=key,
        source=TrackSource.LIDARR,
        source_url=None,
        title=(title or full.stem)[:512],
        artist=artist_n[:512],
        album=(album or None),
        duration_seconds=duration,
        relative_path=relative_path,
        format=fmt,
        file_size_bytes=size,
        art_relative_path=None,
    )
    db.add(track)
    db.flush()
    get_or_link_track(db, user_id, track, add_to_liked=True, added_via=added_via)
    return track


def _duration_seconds(path: Path, ext: str) -> int | None:
    try:
        if ext == "flac":
            audio = FLAC(path)
        else:
            audio = MP3(path)
        length = getattr(audio.info, "length", None)
        return int(length) if length else None
    except Exception:
        return None
