"""Persisted server integration settings (editable from Admin UI)."""

from typing import Optional

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, Session

from app.database import Base


class ServerConfig(Base):
    """Single-row platform configuration (id must be 1)."""

    __tablename__ = "server_config"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    spotify_client_id: Mapped[str] = mapped_column(String(256), default="", nullable=False)
    spotify_client_secret_enc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    spotify_redirect_uri: Mapped[str] = mapped_column(
        String(512), default="http://localhost:8000/api/v1/spotify/callback", nullable=False
    )
    public_web_url: Mapped[str] = mapped_column(String(512), default="http://localhost:3000", nullable=False)
    lidarr_base_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    lidarr_api_key_enc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


def get_or_create_config(db: Session) -> ServerConfig:
    row = db.get(ServerConfig, 1)
    if row:
        return row
    row = ServerConfig(id=1)
    db.add(row)
    db.flush()
    return row
