"""Persisted download / upgrade job status for the Downloads UI."""

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class JobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class DownloadJob(Base):
    __tablename__ = "download_jobs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    celery_task_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)

    url: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    artist: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    audio_format: Mapped[str] = mapped_column(String(8), default="mp3", nullable=False)

    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus, name="job_status", native_enum=False),
        default=JobStatus.QUEUED,
        nullable=False,
    )
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    stage: Mapped[str] = mapped_column(String(128), default="Queued", nullable=False)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    track_id: Mapped[Optional[int]] = mapped_column(ForeignKey("tracks.id", ondelete="SET NULL"), nullable=True)
    discovery_item_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("discovery_items.id", ondelete="SET NULL"), nullable=True
    )
    added_via: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
