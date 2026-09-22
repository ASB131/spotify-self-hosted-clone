"""User accounts with roles, storage quotas, and optional Spotify OAuth tokens."""

import enum
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import BigInteger, Boolean, DateTime, Enum, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.playlist import Playlist
    from app.models.user_track import UserTrack


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    USER = "user"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", native_enum=False),
        default=UserRole.USER,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    storage_quota_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_used_bytes: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    # mp3 | flac — default for new YouTube downloads
    default_audio_format: Mapped[str] = mapped_column(String(8), default="mp3", nullable=False)

    # Spotify OAuth (refresh token persists; access token refreshed by workers)
    spotify_refresh_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    spotify_access_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    spotify_token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user_tracks: Mapped[List["UserTrack"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    playlists: Mapped[List["Playlist"]] = relationship(back_populates="user", cascade="all, delete-orphan")
