"""Per-user library membership (liked / owned tracks)."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.track import Track
    from app.models.user import User


class UserTrack(Base):
    __tablename__ = "user_tracks"
    __table_args__ = (UniqueConstraint("user_id", "track_id", name="uq_user_track"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    track_id: Mapped[int] = mapped_column(ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False, index=True)

    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # library | extension | spotify | discover_weekly | release_radar | upload
    added_via: Mapped[str] = mapped_column(String(32), nullable=False, default="library")

    user: Mapped["User"] = relationship(back_populates="user_tracks")
    track: Mapped["Track"] = relationship(back_populates="user_tracks")
