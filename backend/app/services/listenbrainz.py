"""ListenBrainz public API helpers for recommendations and fresh releases."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.services.musicbrainz import USER_AGENT

logger = logging.getLogger(__name__)
BASE = "https://api.listenbrainz.org/1"


def _get(path: str, params: dict[str, Any] | None = None) -> dict[str, Any] | list | None:
    url = f"{BASE}{path}"
    try:
        with httpx.Client(timeout=45.0, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as client:
            r = client.get(url, params=params or {})
            if r.status_code != 200:
                logger.warning("ListenBrainz %s -> %s %s", path, r.status_code, (r.text or "")[:200])
                return None
            return r.json()
    except Exception:
        logger.exception("ListenBrainz request failed: %s", path)
        return None


def popular_recordings_for_tag(tag: str, count: int = 25) -> list[dict[str, Any]]:
    """LB radio recordings for a genre tag across a wide popularity band."""
    data = _get(
        "/lb-radio/tags",
        {
            "tag": tag,
            "pop_begin": "0",
            "pop_end": "100",
            "count": str(count),
        },
    )
    if not data:
        return []

    recordings: list[dict[str, Any]] = []

    # Common shapes: list of {recording_mbid, similar_artists...} or playlist JSPF
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                recordings.append(_normalize_lb_radio_item(item))
        return [r for r in recordings if r.get("title") or r.get("recording_mbid")][:count]

    if isinstance(data, dict):
        for item in data.get("payload") or data.get("recordings") or []:
            if isinstance(item, dict):
                recordings.append(_normalize_lb_radio_item(item))
        playlists = data.get("payload", {}).get("playlists") if isinstance(data.get("payload"), dict) else None
        for pl in playlists or []:
            tracks = (pl.get("playlist") or {}).get("track") or pl.get("track") or []
            for item in tracks:
                recordings.append(_normalize_track(item))
    return [r for r in recordings if r.get("title") or r.get("recording_mbid")][:count]


def fresh_releases(days: int = 14) -> list[dict[str, Any]]:
    # Trailing slash required (otherwise 308)
    data = _get("/explore/fresh-releases/", {"days": str(min(max(days, 1), 90))})
    if not data:
        return []
    payload = data.get("payload") or data
    return payload.get("releases") or []


def similar_artists(artist_mbid: str) -> list[dict[str, Any]]:
    data = _get(f"/artist-similarity/{artist_mbid}")
    if not data:
        return []
    payload = data.get("payload") or data
    return payload.get("artists") or []


def _normalize_lb_radio_item(item: dict[str, Any]) -> dict[str, Any]:
    # Typical: recording_mbid, recording_name, artist_name, artist_mbids
    title = item.get("recording_name") or item.get("title") or item.get("track_name")
    artist = item.get("artist_name") or item.get("creator") or "Unknown Artist"
    mbids = item.get("artist_mbids") or []
    return {
        "title": title or "Unknown",
        "artist": artist,
        "album": item.get("release_name") or item.get("album"),
        "recording_mbid": item.get("recording_mbid") or item.get("mbid"),
        "release_mbid": item.get("release_mbid"),
        "artist_mbid": mbids[0] if mbids else item.get("artist_mbid"),
        "duration_ms": item.get("length") or item.get("duration"),
    }


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
    parts = ident.rstrip("/").split("/")
    if len(parts) >= 2 and len(parts[-1]) == 36:
        return parts[-1]
    return None
