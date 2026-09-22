"""Spotify token refresh using DB-stored app credentials."""

import logging
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.orm import Session

from app.models.user import User
from app.services.integrations import spotify_settings

logger = logging.getLogger(__name__)


def ensure_spotify_access_token(db: Session, user: User) -> str | None:
    if not user.spotify_refresh_token:
        return None
    now = datetime.now(timezone.utc)
    if user.spotify_access_token and user.spotify_token_expires_at and user.spotify_token_expires_at > now + timedelta(minutes=2):
        return user.spotify_access_token

    sp = spotify_settings(db)
    if not sp.configured:
        logger.error("Spotify app credentials missing in Admin → Integrations")
        return None

    with httpx.Client(timeout=30) as client:
        resp = client.post(
            "https://accounts.spotify.com/api/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": user.spotify_refresh_token,
                "client_id": sp.client_id,
                "client_secret": sp.client_secret,
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
