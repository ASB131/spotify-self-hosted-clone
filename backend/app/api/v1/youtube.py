"""User-facing YouTube search for preview + download."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from app.api.deps import get_current_user
from app.models.user import User
from app.services.youtube_search import search_youtube

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


@router.get("/search", response_model=YoutubeSearchResponse)
def youtube_search(
    q: str = Query(min_length=2, max_length=200),
    limit: int = Query(default=12, ge=1, le=25),
    user: User = Depends(get_current_user),
):
    _ = user  # auth required
    try:
        rows = search_youtube(q.strip(), limit=limit)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"YouTube search failed: {exc}") from exc
    return YoutubeSearchResponse(
        query=q.strip(),
        results=[YoutubeSearchItem(**r) for r in rows],
    )
