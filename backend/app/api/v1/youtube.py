"""User-facing YouTube search for preview + download."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import Optional

from app.api.deps import get_current_user
from app.database import get_db
from app.models.track import Track
from app.models.user import User
from app.models.user_track import UserTrack
from app.services.youtube_search import search_youtube
from app.workers.download_util import extract_youtube_id

router = APIRouter(prefix="/youtube", tags=["youtube"])


class YoutubeSearchItem(BaseModel):
    id: str
    title: str
    artist: str
    channel: str = ""
    duration_seconds: Optional[int] = None
    thumbnail_url: Optional[str] = None
    url: str
    raw_title: str = ""


class YoutubeSearchResponse(BaseModel):
    query: str
    results: list[YoutubeSearchItem]
    offset: int = 0
    has_more: bool = False


def _owned_youtube_ids(db: Session, user_id: int) -> set[str]:
    rows = db.execute(
        select(Track.source_key, Track.source_url)
        .join(UserTrack, UserTrack.track_id == Track.id)
        .where(UserTrack.user_id == user_id)
    ).all()
    out: set[str] = set()
    for source_key, source_url in rows:
        if source_key and str(source_key).startswith("youtube:"):
            out.add(str(source_key).split(":", 1)[1])
        if source_url:
            vid = extract_youtube_id(str(source_url))
            if vid:
                out.add(vid)
    return out


@router.get("/search", response_model=YoutubeSearchResponse)
def youtube_search(
    q: str = Query(min_length=2, max_length=200),
    limit: int = Query(default=12, ge=1, le=25),
    offset: int = Query(default=0, ge=0, le=200),
    exclude_owned: bool = Query(default=True),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        # Fetch a larger window so we can skip owned + paginate.
        fetch_n = min(50, offset + limit + (15 if exclude_owned else 0))
        rows = search_youtube(q.strip(), limit=fetch_n)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"YouTube search failed: {exc}") from exc

    if exclude_owned:
        owned = _owned_youtube_ids(db, user.id)
        if owned:
            rows = [r for r in rows if r.get("id") not in owned]

    page = rows[offset : offset + limit]
    has_more = len(rows) > offset + limit
    # If we filtered heavily, try one more fetch for has_more signal
    if exclude_owned and not has_more and len(page) < limit and offset + limit < 40:
        try:
            bigger = search_youtube(q.strip(), limit=min(50, offset + limit + 25))
            owned = _owned_youtube_ids(db, user.id)
            bigger = [r for r in bigger if r.get("id") not in owned]
            page = bigger[offset : offset + limit]
            has_more = len(bigger) > offset + limit
        except Exception:
            pass

    return YoutubeSearchResponse(
        query=q.strip(),
        results=[YoutubeSearchItem(**r) for r in page],
        offset=offset,
        has_more=has_more,
    )
