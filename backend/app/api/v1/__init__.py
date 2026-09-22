"""API v1 router aggregation."""

from fastapi import APIRouter

from app.api.v1 import (
    admin,
    admin_setup,
    albums,
    artists,
    auth,
    discovery,
    downloads,
    extension,
    integrations_admin,
    playlists,
    setup,
    tracks,
    ws,
    youtube_admin,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(setup.router)
api_router.include_router(tracks.router)
api_router.include_router(albums.router)
api_router.include_router(artists.router)
api_router.include_router(playlists.router)
api_router.include_router(discovery.router)
api_router.include_router(downloads.router)
api_router.include_router(admin.router)
api_router.include_router(integrations_admin.router)
api_router.include_router(admin_setup.router)
api_router.include_router(youtube_admin.router)
api_router.include_router(extension.router)
api_router.include_router(ws.router)
