"""API v1 router aggregation."""

from fastapi import APIRouter

from app.api.v1 import admin, auth, downloads, playlists, spotify, tracks, ws

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(tracks.router)
api_router.include_router(playlists.router)
api_router.include_router(downloads.router)
api_router.include_router(admin.router)
api_router.include_router(spotify.router)
api_router.include_router(ws.router)
