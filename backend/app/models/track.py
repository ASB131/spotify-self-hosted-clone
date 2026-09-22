"""Global track files — one row per physical file; deduplicated by source_key."""

import enum
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import BigInteger, DateTime, Enum, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.playlist import PlaylistTrack
    from app.models.user_track import UserTrack


class AudioFormat(str, enum.Enum):
    MP3 = "mp3"
    FLAC = "flac"


class TrackSource(str, enum.Enum):
    YOUTUBE = "youtube"
    SPOTIFY = "spotify"
    UPLOAD = "upload"


class Track(Base):
    """
    Physical audio file on disk under MUSIC_ROOT.
    Multiple users link via UserTrack; file deleted only when refcount hits zero.
    """

    __tablename__ = "tracks"
    __table_args__ = (
        Index("ix_tracks_source_key", "source_key", unique=True),
        Index("ix_tracks_title_trgm", "title", postgresql_using="gin", postgresql_ops={"title": "gin_trgm_ops"}),
        Index("ix_tracks_artist_trgm", "artist", postgresql_using="gin", postgresql_ops={"artist": "gin_trgm_ops"}),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # e.g. youtube:VIDEO_ID or spotify:TRACK_ID
    source_key: Mapped[str] = mapped_column(String(256), nullable=False)
    source: Mapped[TrackSource] = mapped_column(
        Enum(TrackSource, name="track_source", native_enum=False), nullable=False
    )
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    title: Mapped[str] = mapped_column(String(512), nullable=False)
    artist: Mapped[str] = mapped_column(String(512), nullable=False, default="Unknown Artist")
    album: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    duration_seconds: Mapped[Optional[int]] = mapped_column(nullable=True)

    relative_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    format: Mapped[AudioFormat] = mapped_column(
        Enum(AudioFormat, name="audio_format", native_enum=False), nullable=False
    )
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    bitrate_kbps: Mapped[Optional[int]] = mapped_column(nullable=True)

    # Extracted or embedded art served via API
    art_relative_path: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user_tracks: Mapped[List["UserTrack"]] = relationship(back_populates="track")
    playlist_entries: Mapped[List["PlaylistTrack"]] = relationship(back_populates="track")
