"""Spotify token refresh for background workers."""

import logging
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.user import User

logger = logging.getLogger(__name__)
settings = get_settings()


def ensure_spotify_access_token(db: Session, user: User) -> str | None:
    if not user.spotify_refresh_token:
        return None
    now = datetime.now(timezone.utc)
    if user.spotify_access_token and user.spotify_token_expires_at and user.spotify_token_expires_at > now + timedelta(minutes=2):
        return user.spotify_access_token

    with httpx.Client(timeout=30) as client:
        resp = client.post(
            "https://accounts.spotify.com/api/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": user.spotify_refresh_token,
                "client_id": settings.spotify_client_id,
                "client_secret": settings.spotify_client_secret,
            },
        )
    if resp.status_code != 200:
        logger.error("Spotify refresh failed for user %s: %s", user.id, resp.text)
        return None

    data = resp.json()
    user.spotify_access_token = data["access_token"]
    user.spotify_token_expires_at = now + timedelta(seconds=data.get("expires_in", 3600))
    if data.get("refresh_token"):
        user.spotify_refresh_token = data["refresh_token"]
    db.add(user)
    db.commit()
    return user.spotify_access_token
