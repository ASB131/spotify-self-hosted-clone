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
