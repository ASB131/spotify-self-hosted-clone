"""Administration: users, quotas, invite codes."""

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.database import get_db
from app.models.invite_code import InviteCode
from app.models.user import User
from app.models.user_track import UserTrack
from app.schemas.auth import AdminSetQuota, AdminUserSummary, InviteCodeCreate, InviteCodePublic

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=list[AdminUserSummary])
def list_users(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.scalars(select(User).order_by(User.id)).all()


@router.patch("/users/{user_id}/quota", response_model=AdminUserSummary)
def set_quota(
    user_id: int,
    body: AdminSetQuota,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.storage_quota_bytes = body.storage_quota_bytes
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/active")
def set_active(
    user_id: int,
    active: bool,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = active
    db.commit()
    return {"ok": True}


@router.get("/storage-overview")
def storage_overview(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.execute(
        select(
            User.id,
            User.display_name,
            User.storage_used_bytes,
            User.storage_quota_bytes,
            func.count(UserTrack.id).label("tracks"),
        )
        .outerjoin(UserTrack, UserTrack.user_id == User.id)
        .group_by(User.id)
    ).all()
    return [
        {
            "user_id": r.id,
            "display_name": r.display_name,
            "storage_used_bytes": r.storage_used_bytes,
            "storage_quota_bytes": r.storage_quota_bytes,
            "tracks": r.tracks,
        }
        for r in rows
    ]


@router.post("/invite-codes", response_model=InviteCodePublic)
def create_invite(
    body: InviteCodeCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    code = secrets.token_urlsafe(12)
    expires = None
    if body.expires_in_days:
        expires = datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)
    invite = InviteCode(
        code=code,
        created_by_id=admin.id,
        max_uses=body.max_uses,
        uses=0,
        expires_at=expires,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


@router.get("/invite-codes", response_model=list[InviteCodePublic])
def list_invites(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.scalars(select(InviteCode).order_by(InviteCode.created_at.desc())).all()


@router.get("/health")
def admin_health(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Deep health for admin UI: DB, Redis, disk, yt-dlp, cookies."""
    import shutil
    import subprocess
    from pathlib import Path

    import redis

    from app.config import get_settings

    settings = get_settings()
    checks: dict = {}

    # Database
    try:
        db.execute(select(func.count()).select_from(User))
        checks["database"] = {"ok": True, "detail": "reachable"}
    except Exception as e:
        checks["database"] = {"ok": False, "detail": str(e)[:200]}

    # Redis
    try:
        r = redis.from_url(settings.redis_url, socket_connect_timeout=2)
        r.ping()
        checks["redis"] = {"ok": True, "detail": "ping ok"}
    except Exception as e:
        checks["redis"] = {"ok": False, "detail": str(e)[:200]}

    # Celery broker
    try:
        r = redis.from_url(settings.celery_broker_url, socket_connect_timeout=2)
        r.ping()
        checks["celery_broker"] = {"ok": True, "detail": "ping ok"}
    except Exception as e:
        checks["celery_broker"] = {"ok": False, "detail": str(e)[:200]}

    # Music disk
    try:
        root = Path(settings.music_root)
        usage = shutil.disk_usage(str(root if root.exists() else "/"))
        free_gb = usage.free / (1024**3)
        checks["music_disk"] = {
            "ok": free_gb > 1,
            "detail": f"{free_gb:.1f} GB free / {usage.total / (1024**3):.1f} GB total",
            "free_bytes": usage.free,
            "total_bytes": usage.total,
        }
    except Exception as e:
        checks["music_disk"] = {"ok": False, "detail": str(e)[:200]}

    # yt-dlp
    try:
        out = subprocess.check_output(["yt-dlp", "--version"], text=True, timeout=8).strip()
        checks["yt_dlp"] = {"ok": True, "detail": out}
    except Exception as e:
        checks["yt_dlp"] = {"ok": False, "detail": str(e)[:200]}

    # cookies
    cookies = Path(settings.ytdlp_cookies_path)
    checks["cookies"] = {
        "ok": cookies.is_file() and cookies.stat().st_size > 0,
        "detail": "configured" if cookies.is_file() else "missing",
        "path": str(cookies),
    }

    overall = all(c.get("ok") for c in checks.values() if isinstance(c, dict) and "ok" in c)
    return {"ok": overall, "checks": checks}
