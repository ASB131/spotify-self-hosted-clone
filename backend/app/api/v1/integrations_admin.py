"""Admin integration settings (Spotify, Lidarr) stored in the database."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.database import get_db
from app.models.server_config import get_or_create_config
from app.models.user import User
from app.schemas.integrations import (
    LidarrIntegrationPublic,
    LidarrIntegrationUpdate,
    SpotifyIntegrationPublic,
    SpotifyIntegrationUpdate,
)
from app.services.integrations import lidarr_settings, spotify_settings
from app.services.secret_box import encrypt_value

router = APIRouter(prefix="/admin/integrations", tags=["admin-integrations"])


@router.get("/spotify", response_model=SpotifyIntegrationPublic)
def get_spotify_integration(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    row = get_or_create_config(db)
    resolved = spotify_settings(db)
    return SpotifyIntegrationPublic(
        client_id=resolved.client_id,
        has_client_secret=bool(row.spotify_client_secret_enc or resolved.client_secret),
        redirect_uri=resolved.redirect_uri,
        public_web_url=resolved.public_web_url,
        configured=resolved.configured,
    )


@router.put("/spotify", response_model=SpotifyIntegrationPublic)
def update_spotify_integration(
    body: SpotifyIntegrationUpdate,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = get_or_create_config(db)
    row.spotify_client_id = body.client_id.strip()
    row.spotify_redirect_uri = body.redirect_uri.strip()
    row.public_web_url = body.public_web_url.strip().rstrip("/")
    if body.client_secret is not None and body.client_secret.strip():
        row.spotify_client_secret_enc = encrypt_value(body.client_secret.strip())
    db.commit()
    db.refresh(row)
    resolved = spotify_settings(db)
    return SpotifyIntegrationPublic(
        client_id=resolved.client_id,
        has_client_secret=bool(row.spotify_client_secret_enc),
        redirect_uri=resolved.redirect_uri,
        public_web_url=resolved.public_web_url,
        configured=resolved.configured,
    )


@router.get("/lidarr", response_model=LidarrIntegrationPublic)
def get_lidarr_integration(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    row = get_or_create_config(db)
    resolved = lidarr_settings(db)
    return LidarrIntegrationPublic(
        base_url=resolved.base_url,
        has_api_key=bool(row.lidarr_api_key_enc),
        configured=resolved.configured,
    )


@router.put("/lidarr", response_model=LidarrIntegrationPublic)
def update_lidarr_integration(
    body: LidarrIntegrationUpdate,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = get_or_create_config(db)
    row.lidarr_base_url = body.base_url.strip().rstrip("/") or None
    if body.api_key is not None and body.api_key.strip():
        row.lidarr_api_key_enc = encrypt_value(body.api_key.strip())
    db.commit()
    resolved = lidarr_settings(db)
    return LidarrIntegrationPublic(
        base_url=resolved.base_url or "",
        has_api_key=bool(row.lidarr_api_key_enc),
        configured=resolved.configured,
    )
