"""FastAPI dependencies for authentication."""

from typing import Optional

from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.services.security import TOKEN_TYPE_ACCESS, decode_token

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"


def _token_from_request(request: Request, authorization: Optional[str]) -> Optional[str]:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip()
    return request.cookies.get(ACCESS_COOKIE)


def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Optional[User]:
    token = _token_from_request(request, authorization)
    if not token:
        return None
    payload = decode_token(token)
    if not payload or payload.get("type") != TOKEN_TYPE_ACCESS:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    user = db.get(User, int(user_id))
    if not user or not user.is_active:
        return None
    return user


def get_current_user(user: Optional[User] = Depends(get_current_user_optional)) -> User:
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return user
