"""Discovery playlists (Discover Weekly / Release Radar), MBID cache, play history."""

import enum
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.track import Track
    from app.models.user import User


class DiscoveryKind(str, enum.Enum):
    DISCOVER_WEEKLY = "discover_weekly"
    RELEASE_RADAR = "release_radar"


class DiscoveryItemStatus(str, enum.Enum):
    AVAILABLE = "available"
    DOWNLOADING = "downloading"
    READY = "ready"
    FAILED = "failed"


class ArtistMbid(Base):
    """Cached MusicBrainz artist resolution for library artist names."""

    __tablename__ = "artist_mbids"
    __table_args__ = (UniqueConstraint("normalized_name", name="uq_artist_mbid_name"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    normalized_name: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(512), nullable=False)
    mbid: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    tags_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON list of genre tags
    resolved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PlayEvent(Base):
    __tablename__ = "play_events"
    __table_args__ = (Index("ix_play_events_user_played", "user_id", "played_at"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    track_id: Mapped[int] = mapped_column(ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False, index=True)
    playlist_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("playlists.id", ondelete="SET NULL"), nullable=True
    )
    played_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    track: Mapped["Track"] = relationship()


class DiscoveryPlaylist(Base):
    """Per-user system discovery playlist (one row per kind)."""

    __tablename__ = "discovery_playlists"
    __table_args__ = (UniqueConstraint("user_id", "kind", name="uq_discovery_user_kind"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[DiscoveryKind] = mapped_column(
        Enum(DiscoveryKind, name="discovery_kind", native_enum=False), nullable=False
    )
    week_key: Mapped[str] = mapped_column(String(16), nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    items: Mapped[List["DiscoveryItem"]] = relationship(
        back_populates="playlist", cascade="all, delete-orphan", order_by="DiscoveryItem.position"
    )


class DiscoveryItem(Base):
    """Metadata-only discovery row until downloaded into the library."""

    __tablename__ = "discovery_items"
    __table_args__ = (
        Index("ix_discovery_items_playlist_week", "playlist_id", "week_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    playlist_id: Mapped[int] = mapped_column(
        ForeignKey("discovery_playlists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    week_key: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    title: Mapped[str] = mapped_column(String(512), nullable=False)
    artist: Mapped[str] = mapped_column(String(512), nullable=False)
    album: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    recording_mbid: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    release_mbid: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    artist_mbid: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    status: Mapped[DiscoveryItemStatus] = mapped_column(
        Enum(DiscoveryItemStatus, name="discovery_item_status", native_enum=False),
        default=DiscoveryItemStatus.AVAILABLE,
        nullable=False,
    )
    track_id: Mapped[Optional[int]] = mapped_column(ForeignKey("tracks.id", ondelete="SET NULL"), nullable=True)
    acquire_via: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)  # lidarr | youtube
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    art_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    playlist: Mapped["DiscoveryPlaylist"] = relationship(back_populates="items")
    track: Mapped[Optional["Track"]] = relationship()
