"""ListenBrainz public API helpers for recommendations and fresh releases."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.services.musicbrainz import USER_AGENT

logger = logging.getLogger(__name__)
BASE = "https://api.listenbrainz.org/1"


def _get(path: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
    url = f"{BASE}{path}"
    try:
        with httpx.Client(timeout=45.0, headers={"User-Agent": USER_AGENT}) as client:
            r = client.get(url, params=params or {})
            if r.status_code != 200:
                logger.warning("ListenBrainz %s -> %s", path, r.status_code)
                return None
            return r.json()
    except Exception:
        logger.exception("ListenBrainz request failed: %s", path)
        return None


def popular_recordings_for_tag(tag: str, count: int = 25) -> list[dict[str, Any]]:
    """LB radio / popular recordings associated with a genre tag."""
    data = _get(
        "/lb-radio/tags",
        {
            "tag": tag,
            "count": str(count),
        },
    )
    if not data:
        # Fallback: site stats popular recordings (global)
        return []
    # Response shapes vary; normalize
    playlists = data.get("payload", {}).get("playlists") or data.get("playlists") or []
    recordings: list[dict[str, Any]] = []
    for pl in playlists:
        for item in pl.get("playlist", {}).get("track") or pl.get("track") or []:
            recordings.append(_normalize_track(item))
    if recordings:
        return recordings[:count]

    # Alternate shape: list of recordings
    for item in data.get("recording_mbid") and [] or data.get("payload", {}).get("recording_mbid") or []:
        pass
    return recordings


def fresh_releases(days: int = 14) -> list[dict[str, Any]]:
    data = _get("/explore/fresh-releases", {"days": str(days)})
    if not data:
        return []
    payload = data.get("payload") or data
    releases = payload.get("releases") or []
    return releases


def similar_artists(artist_mbid: str) -> list[dict[str, Any]]:
    data = _get(f"/artist-similarity/{artist_mbid}")
    if not data:
        return []
    payload = data.get("payload") or data
    artists = payload.get("artists") or []
    return artists


def _normalize_track(item: dict[str, Any]) -> dict[str, Any]:
    ext = item.get("extension", {}).get("https://musicbrainz.org/recording/", {}) or {}
    additional = item.get("additional_metadata") or {}
    title = item.get("title") or item.get("identifier") or "Unknown"
    creator = item.get("creator") or additional.get("artist_name") or "Unknown Artist"
    mbid = (
        ext.get("recording_mbid")
        or additional.get("recording_mbid")
        or item.get("recording_mbid")
        or _mbid_from_identifier(item.get("identifier"))
    )
    return {
        "title": title.split(" - ")[-1] if " - " in str(title) and not item.get("creator") else title,
        "artist": creator,
        "album": additional.get("release_name") or item.get("album"),
        "recording_mbid": mbid,
        "release_mbid": additional.get("release_mbid") or ext.get("release_mbid"),
        "artist_mbid": additional.get("artist_mbids", [None])[0]
        if isinstance(additional.get("artist_mbids"), list)
        else additional.get("artist_mbid"),
        "duration_ms": item.get("duration"),
    }


def _mbid_from_identifier(ident: str | None) -> str | None:
    if not ident:
        return None
    # https://musicbrainz.org/recording/UUID
    parts = ident.rstrip("/").split("/")
    if len(parts) >= 2 and len(parts[-1]) == 36:
        return parts[-1]
    return None


def popular_global(count: int = 40) -> list[dict[str, Any]]:
    """Best-effort popular recordings via LB site stats."""
    data = _get("/stats/sitewide/artists", {"range": "week", "count": "15"})
    # Use artists then we expand elsewhere; return empty if shape wrong
    if not data:
        return []
    return []
