"""Authentication, bootstrap, and session cookies."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import ACCESS_COOKIE, REFRESH_COOKIE, get_current_user
from app.config import get_settings
from app.database import get_db
from app.models.invite_code import InviteCode
from app.models.playlist import Playlist
from app.models.user import User, UserRole
from app.models.user_track import UserTrack
from app.schemas.auth import (
    BootstrapAdminRequest,
    BootstrapResponse,
    LoginRequest,
    RegisterRequest,
    SetupStatus,
    TokenResponse,
    UserPublic,
    UserStats,
)
from app.services.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def _set_auth_cookies(response: Response, user_id: int) -> None:
    access = create_access_token(user_id)
    refresh = create_refresh_token(user_id)
    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.refresh_token_expire_days * 86400,
        path="/api/v1/auth/refresh",
    )


@router.get("/setup-status", response_model=SetupStatus)
def setup_status(db: Session = Depends(get_db)) -> SetupStatus:
    count = db.scalar(select(func.count()).select_from(User)) or 0
    return SetupStatus(needs_setup=count == 0)


@router.post("/bootstrap", response_model=BootstrapResponse)
def bootstrap_admin(body: BootstrapAdminRequest, response: Response, db: Session = Depends(get_db)) -> BootstrapResponse:
    count = db.scalar(select(func.count()).select_from(User)) or 0
    if count > 0:
        raise HTTPException(status_code=403, detail="Setup already completed")

    user = User(
        email=body.email.lower(),
        display_name=body.display_name,
        password_hash=hash_password(body.password),
        role=UserRole.ADMIN,
        storage_quota_bytes=settings.default_storage_quota_bytes,
        storage_used_bytes=0,
    )
    db.add(user)
    db.flush()
    db.add(
        Playlist(
            user_id=user.id,
            name="Liked Songs",
            description="Your liked tracks",
            is_liked_songs=True,
        )
    )
    db.commit()
    db.refresh(user)
    access = create_access_token(user.id)
    _set_auth_cookies(response, user.id)
    pub = UserPublic.model_validate(user)
    return BootstrapResponse(**pub.model_dump(), access_token=access)


@router.post("/register", response_model=UserPublic)
def register(body: RegisterRequest, response: Response, db: Session = Depends(get_db)) -> User:
    count = db.scalar(select(func.count()).select_from(User)) or 0
    if count == 0:
        raise HTTPException(status_code=403, detail="Complete admin setup first")

    invite = db.scalar(select(InviteCode).where(InviteCode.code == body.invite_code.strip()))
    if not invite:
        raise HTTPException(status_code=400, detail="Invalid invite code")
    if invite.expires_at and invite.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invite code expired")
    if invite.uses >= invite.max_uses:
        raise HTTPException(status_code=400, detail="Invite code exhausted")

    existing = db.scalar(select(User).where(User.email == body.email.lower()))
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=body.email.lower(),
        display_name=body.display_name,
        password_hash=hash_password(body.password),
        role=UserRole.USER,
        storage_quota_bytes=settings.default_storage_quota_bytes,
        storage_used_bytes=0,
    )
    db.add(user)
    invite.uses += 1
    db.flush()
    db.add(
        Playlist(
            user_id=user.id,
            name="Liked Songs",
            description="Your liked tracks",
            is_liked_songs=True,
        )
    )
    db.commit()
    db.refresh(user)
    _set_auth_cookies(response, user.id)
    return user


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    access = create_access_token(user.id)
    _set_auth_cookies(response, user.id)
    return TokenResponse(access_token=access)


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth/refresh")
    return {"ok": True}


@router.get("/me", response_model=UserPublic)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.get("/me/stats", response_model=UserStats)
def my_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> UserStats:
    tracks_count = db.scalar(select(func.count()).select_from(UserTrack).where(UserTrack.user_id == user.id)) or 0
    from app.models.playlist import Playlist

    playlists_count = db.scalar(select(func.count()).select_from(Playlist).where(Playlist.user_id == user.id)) or 0
    return UserStats(
        tracks_count=tracks_count,
        playlists_count=playlists_count,
        storage_used_bytes=user.storage_used_bytes,
        storage_quota_bytes=user.storage_quota_bytes,
    )


@router.get("/extension-token", response_model=TokenResponse)
def extension_token(user: User = Depends(get_current_user)) -> TokenResponse:
    """Issue a fresh JWT for the Chrome extension (paste into extension options)."""
    return TokenResponse(access_token=create_access_token(user.id))
