"""Spotify OAuth linking for background sync."""

from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.config import get_settings
from app.database import get_db
from app.models.user import User

router = APIRouter(prefix="/spotify", tags=["spotify"])
settings = get_settings()

SCOPES = "user-library-read playlist-read-private"


@router.get("/connect")
def connect_spotify(user: User = Depends(get_current_user)):
    if not settings.spotify_client_id:
        raise HTTPException(status_code=503, detail="Spotify integration not configured")
    params = urlencode(
        {
            "client_id": settings.spotify_client_id,
            "response_type": "code",
            "redirect_uri": settings.spotify_redirect_uri,
            "scope": SCOPES,
            "state": str(user.id),
        }
    )
    return RedirectResponse(f"https://accounts.spotify.com/authorize?{params}")


@router.get("/callback")
def spotify_callback(code: str = Query(...), state: str = Query(...), db: Session = Depends(get_db)):
    user = db.get(User, int(state))
    if not user:
        raise HTTPException(status_code=400, detail="Invalid state")

    with httpx.Client(timeout=30) as client:
        resp = client.post(
            "https://accounts.spotify.com/api/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.spotify_redirect_uri,
                "client_id": settings.spotify_client_id,
                "client_secret": settings.spotify_client_secret,
            },
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Spotify token exchange failed")

    data = resp.json()
    user.spotify_access_token = data["access_token"]
    user.spotify_refresh_token = data.get("refresh_token") or user.spotify_refresh_token
    user.spotify_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=data.get("expires_in", 3600))
    db.commit()
    return RedirectResponse(url="/profile?spotify=connected")
