"""YouTube search via yt-dlp (no Google API key)."""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Common junk in YouTube music titles
_JUNK = re.compile(
    r"\s*[\(\[]?(?:official\s*(?:music\s*)?video|lyrics?|audio|hd|4k|mv|videoclip)[\)\]]?",
    re.I,
)


def _guess_title_artist(raw_title: str, channel: str) -> tuple[str, str]:
    title = _JUNK.sub("", (raw_title or "").strip()).strip(" -–—|")
    artist = (channel or "").strip()
    # "Artist - Title" / "Artist – Title"
    for sep in (" - ", " – ", " — ", " | "):
        if sep in title:
            left, right = title.split(sep, 1)
            left, right = left.strip(), right.strip()
            if left and right:
                # Prefer channel as artist when it looks like a topic channel
                if artist.lower().endswith(" - topic") or artist.lower().endswith("topic"):
                    return right, left if len(left) < len(right) * 2 else artist.replace(" - Topic", "").strip()
                return right, left
    if artist.lower().endswith(" - topic"):
        artist = artist[: -len(" - Topic")].strip()
    return title or raw_title or "Unknown", artist or "Unknown Artist"


def search_youtube(query: str, *, limit: int = 12) -> list[dict[str, Any]]:
    """Return flat search results: id, title, artist, channel, duration, thumbnail, url."""
    import yt_dlp

    from app.workers.download_util import _writable_cookiefile

    q = (query or "").strip()
    if len(q) < 2:
        return []
    limit = max(1, min(25, limit))

    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": "in_playlist",
        "skip_download": True,
        "js_runtimes": {"deno": {}},
        "default_search": "ytsearch",
    }
    cookies = _writable_cookiefile()
    if cookies:
        opts["cookiefile"] = cookies

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"ytsearch{limit}:{q}", download=False)
    except Exception as exc:
        logger.warning("YouTube search failed for %r: %s", q, exc)
        raise

    entries = (info or {}).get("entries") or []
    out: list[dict[str, Any]] = []
    for e in entries:
        if not e:
            continue
        vid = e.get("id") or e.get("url")
        if not vid or not isinstance(vid, str):
            continue
        # flat results sometimes put full URL in url
        if "youtube.com" in vid or "youtu.be" in vid:
            from app.workers.download_util import extract_youtube_id

            parsed = extract_youtube_id(vid)
            if not parsed:
                continue
            vid = parsed
        if len(vid) < 6:
            continue

        raw_title = e.get("title") or "Unknown"
        channel = e.get("channel") or e.get("uploader") or ""
        title, artist = _guess_title_artist(raw_title, channel)
        duration = e.get("duration")
        try:
            duration_i = int(duration) if duration is not None else None
        except (TypeError, ValueError):
            duration_i = None

        thumb = None
        thumbs = e.get("thumbnails") or []
        if thumbs:
            thumb = thumbs[-1].get("url")
        if not thumb:
            thumb = f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"

        out.append(
            {
                "id": vid,
                "title": title,
                "artist": artist,
                "channel": channel,
                "duration_seconds": duration_i,
                "thumbnail_url": thumb,
                "url": f"https://www.youtube.com/watch?v={vid}",
                "raw_title": raw_title,
            }
        )
    return out
