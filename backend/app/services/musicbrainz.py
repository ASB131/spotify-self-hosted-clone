"""MusicBrainz HTTP client with polite rate limiting and caching helpers."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

USER_AGENT = "MixPlayerSelfHosted/2.0.0 (https://github.com/ASB131/spotify-self-hosted-clone)"
BASE = "https://musicbrainz.org/ws/2"
_last_call = 0.0
_MIN_INTERVAL = 1.05


def _throttle() -> None:
    global _last_call
    now = time.monotonic()
    wait = _MIN_INTERVAL - (now - _last_call)
    if wait > 0:
        time.sleep(wait)
    _last_call = time.monotonic()


def _get(path: str, params: dict[str, str] | None = None) -> dict[str, Any] | None:
    _throttle()
    q = dict(params or {})
    q.setdefault("fmt", "json")
    url = f"{BASE}{path}"
    try:
        with httpx.Client(timeout=30.0, headers={"User-Agent": USER_AGENT}) as client:
            r = client.get(url, params=q)
            if r.status_code == 503:
                time.sleep(2)
                r = client.get(url, params=q)
            if r.status_code != 200:
                logger.warning("MusicBrainz %s -> %s", path, r.status_code)
                return None
            return r.json()
    except Exception:
        logger.exception("MusicBrainz request failed: %s", path)
        return None


def search_artist(name: str) -> dict[str, Any] | None:
    data = _get("/artist", {"query": f'artist:"{name}"', "limit": "5"})
    if not data:
        return None
    artists = data.get("artists") or []
    if not artists:
        return None
    # Prefer exact-ish name match
    lower = name.strip().lower()
    for a in artists:
        if (a.get("name") or "").strip().lower() == lower:
            return a
    return artists[0]


def artist_tags(mbid: str) -> list[str]:
    data = _get(f"/artist/{mbid}", {"inc": "tags"})
    if not data:
        return []
    tags = data.get("tags") or []
    tags = sorted(tags, key=lambda t: t.get("count") or 0, reverse=True)
    return [t["name"] for t in tags if t.get("name")][:8]


def recording_lookup(recording_mbid: str) -> dict[str, Any] | None:
    return _get(f"/recording/{recording_mbid}", {"inc": "artists+releases"})


def release_tracklist(release_mbid: str) -> list[dict[str, Any]]:
    data = _get(f"/release/{release_mbid}", {"inc": "recordings+artist-credits"})
    if not data:
        return []
    out: list[dict[str, Any]] = []
    for medium in data.get("media") or []:
        for track in medium.get("tracks") or []:
            rec = track.get("recording") or {}
            credit = track.get("artist-credit") or data.get("artist-credit") or []
            artist = " ".join(
                (c.get("name") or "") + (c.get("joinphrase") or "") for c in credit
            ).strip() or "Unknown Artist"
            out.append(
                {
                    "title": track.get("title") or rec.get("title") or "Unknown",
                    "artist": artist,
                    "album": data.get("title"),
                    "recording_mbid": rec.get("id"),
                    "release_mbid": release_mbid,
                    "duration_ms": track.get("length") or rec.get("length"),
                }
            )
    return out


def browse_artist_releases(artist_mbid: str, limit: int = 25) -> list[dict[str, Any]]:
    data = _get(
        "/release-group",
        {"artist": artist_mbid, "type": "album|ep|single", "limit": str(limit), "offset": "0"},
    )
    if not data:
        return []
    return data.get("release-groups") or []


def search_artists(query: str, limit: int = 10) -> list[dict[str, Any]]:
    data = _get("/artist", {"query": query, "limit": str(limit)})
    if not data:
        return []
    out = []
    for a in data.get("artists") or []:
        out.append(
            {
                "mbid": a.get("id"),
                "name": a.get("name") or "Unknown",
                "disambiguation": a.get("disambiguation"),
                "type": a.get("type"),
                "score": a.get("score"),
            }
        )
    return out


def search_recordings(query: str, limit: int = 20) -> list[dict[str, Any]]:
    data = _get("/recording", {"query": query, "limit": str(limit)})
    if not data:
        return []
    out: list[dict[str, Any]] = []
    for rec in data.get("recordings") or []:
        credit = rec.get("artist-credit") or []
        artist = " ".join(
            (c.get("name") or "") + (c.get("joinphrase") or "") for c in credit
        ).strip() or "Unknown Artist"
        artist_mbid = None
        if credit and isinstance(credit[0].get("artist"), dict):
            artist_mbid = credit[0]["artist"].get("id")
        releases = rec.get("releases") or []
        album = releases[0].get("title") if releases else None
        release_mbid = releases[0].get("id") if releases else None
        out.append(
            {
                "recording_mbid": rec.get("id"),
                "title": rec.get("title") or "Unknown",
                "artist": artist,
                "artist_mbid": artist_mbid,
                "album": album,
                "release_mbid": release_mbid,
                "duration_ms": rec.get("length"),
                "score": rec.get("score"),
            }
        )
    return out


def artist_lookup(artist_mbid: str) -> dict[str, Any] | None:
    return _get(f"/artist/{artist_mbid}", {"inc": "tags+url-rels"})


def artist_release_groups(artist_mbid: str, limit: int = 50) -> list[dict[str, Any]]:
    return browse_artist_releases(artist_mbid, limit=limit)


def search_recordings_by_tag(tag: str, limit: int = 20) -> list[dict[str, Any]]:
    data = _get("/recording", {"query": f'tag:"{tag}"', "limit": str(limit)})
    if not data:
        return []
    out: list[dict[str, Any]] = []
    for rec in data.get("recordings") or []:
        credit = rec.get("artist-credit") or []
        artist = " ".join(
            (c.get("name") or "") + (c.get("joinphrase") or "") for c in credit
        ).strip() or "Unknown Artist"
        releases = rec.get("releases") or []
        album = releases[0].get("title") if releases else None
        release_mbid = releases[0].get("id") if releases else None
        out.append(
            {
                "title": rec.get("title") or "Unknown",
                "artist": artist,
                "album": album,
                "recording_mbid": rec.get("id"),
                "release_mbid": release_mbid,
                "duration_ms": rec.get("length"),
            }
        )
    return out


def recordings_for_artist(artist_mbid: str, limit: int = 50) -> list[dict[str, Any]]:
    """
    Latest recordings for an artist by release-group date (not relevance score).
    Walks newest release groups first so recent singles/albums appear before old hits.
    """
    rgs = artist_release_groups(artist_mbid, limit=50)
    rgs = sorted(
        [rg for rg in rgs if rg.get("id")],
        key=lambda rg: rg.get("first-release-date") or "",
        reverse=True,
    )
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    # Newest ~12 groups keep API calls bounded (~1s throttle each)
    for rg in rgs[:8]:
        rg_date = rg.get("first-release-date") or ""
        rel_mbid = release_group_first_release_mbid(rg["id"])
        if not rel_mbid:
            continue
        for t in release_tracklist(rel_mbid):
            key = t.get("recording_mbid") or f"{t.get('title')}|{t.get('album')}"
            if not key or key in seen:
                continue
            seen.add(key)
            row = dict(t)
            row["date"] = rg_date or row.get("date")
            row["score"] = None
            out.append(row)
            if len(out) >= limit:
                return out
    return out


def cover_art_url(release_mbid: str | None = None, release_group_mbid: str | None = None) -> str | None:
    """Cover Art Archive front thumbnail URL (no request — CAA redirects)."""
    if release_mbid:
        return f"https://coverartarchive.org/release/{release_mbid}/front-250"
    if release_group_mbid:
        return f"https://coverartarchive.org/release-group/{release_group_mbid}/front-250"
    return None


def release_group_first_release_mbid(release_group_mbid: str) -> str | None:
    data = _get(f"/release-group/{release_group_mbid}", {"inc": "releases"})
    if not data:
        return None
    releases = data.get("releases") or []
    if not releases:
        return None
    # Prefer official / earliest
    releases = sorted(releases, key=lambda r: r.get("date") or "9999")
    return releases[0].get("id")


def tags_json(tags: list[str]) -> str:
    return json.dumps(tags)
