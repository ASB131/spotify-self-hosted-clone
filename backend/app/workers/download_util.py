"""yt-dlp download, metadata, album art embedding."""

import logging
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional, Tuple
from urllib.parse import parse_qs, urlparse

import yt_dlp
from mutagen.flac import FLAC, Picture
from mutagen.id3 import APIC, ID3
from mutagen.mp3 import MP3

from app.config import get_settings
from app.models.track import AudioFormat, TrackSource
from app.services.storage_paths import music_root, new_art_relative_path, new_track_relative_path, track_file_path

logger = logging.getLogger(__name__)
settings = get_settings()

YOUTUBE_ID_RE = re.compile(r"(?:v=|youtu\.be/|/shorts/)([A-Za-z0-9_-]{6,})")


def extract_youtube_id(url: str) -> Optional[str]:
    parsed = urlparse(url)
    if "youtube.com" in parsed.netloc:
        if parsed.path.startswith("/watch"):
            q = parse_qs(parsed.query)
            return q.get("v", [None])[0]
        m = re.search(r"/shorts/([^/?]+)", parsed.path)
        if m:
            return m.group(1)
    if "youtu.be" in parsed.netloc:
        return parsed.path.lstrip("/").split("/")[0] or None
    m = YOUTUBE_ID_RE.search(url)
    return m.group(1) if m else None


def _cookie_candidates() -> list[Path]:
    """Prefer admin-uploaded cookies on writable volume, then Docker-mounted file."""
    return [
        Path(settings.app_data) / "cookies.txt",
        Path(settings.ytdlp_cookies_path),
    ]


def _cookie_source_path() -> Optional[Path]:
    for src in _cookie_candidates():
        if not src.is_file():
            continue
        try:
            text = src.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        data_lines = [ln for ln in text.splitlines() if ln.strip() and not ln.strip().startswith("#")]
        if len(data_lines) >= 3:
            return src
    return None


def _writable_cookiefile() -> Optional[str]:
    """
    yt-dlp may update cookies on disk. Copy to /tmp so read-only mounts never break downloads.
    Cookies are optional — android player clients often work without them.
    """
    src = _cookie_source_path()
    if not src:
        return None
    dest = Path(tempfile.gettempdir()) / "ytdlp_cookies.txt"
    try:
        shutil.copy2(src, dest)
        return str(dest)
    except OSError as exc:
        logger.warning("Could not copy cookies to writable path: %s", exc)
        return None


def _ydl_opts(audio_format: str, outtmpl: str, *, use_cookies: bool = True) -> dict:
    """
    Use yt-dlp defaults + Deno for YouTube EJS. Prefer formats that survive SABR.
    """
    codec = "flac" if audio_format == "flac" else "mp3"
    opts: dict = {
        "outtmpl": outtmpl,
        "quiet": True,
        "no_warnings": False,
        "noplaylist": True,
        "retries": 5,
        "fragment_retries": 5,
        "ignoreerrors": False,
        "writethumbnail": True,
        "embedthumbnail": False,
        # Include HLS audio (233/234) when progressive streams are missing
        "format": "bestaudio/best/233/234/bestaudio*/best*",
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": codec,
                "preferredquality": "0",
            }
        ],
        "js_runtimes": {"deno": {}},
    }
    if use_cookies:
        cookiefile = _writable_cookiefile()
        if cookiefile:
            opts["cookiefile"] = cookiefile
            logger.info("Using YouTube cookies from uploaded/mounted file")
        else:
            logger.info("No cookies configured — using yt-dlp default clients")
    else:
        logger.info("Retrying yt-dlp without cookies")

    return opts


def download_youtube_audio(
    url: str,
    audio_format: str,
    title_override: Optional[str],
    artist_override: Optional[str],
) -> Tuple[dict, Path, Optional[Path]]:
    """
    Download to a temp directory. Returns (info_dict, audio_path, thumbnail_path).
    Raises on failure (including YouTube bot checks).
    """
    tmp = Path(tempfile.mkdtemp(prefix="ytdlp_"))
    outtmpl = str(tmp / "%(id)s.%(ext)s")

    attempts: list[dict] = [
        _ydl_opts(audio_format, outtmpl, use_cookies=True),
        {**_ydl_opts(audio_format, outtmpl, use_cookies=False), "format": "bestaudio/best/233/234"},
        {**_ydl_opts(audio_format, outtmpl, use_cookies=False), "format": "best"},
        {
            **_ydl_opts(audio_format, outtmpl, use_cookies=False),
            "format": "bestaudio/best",
            "extractor_args": {"youtube": {"player_client": ["tv", "web_safari", "mweb", "web"]}},
        },
    ]

    last_exc: Exception | None = None
    info = None
    for i, opts in enumerate(attempts):
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
            if info:
                break
        except Exception as exc:
            last_exc = exc
            logger.warning("yt-dlp attempt %s failed (%s)", i + 1, exc)
            for p in tmp.glob("*"):
                try:
                    p.unlink()
                except OSError:
                    pass

    if not info:
        shutil.rmtree(tmp, ignore_errors=True)
        logger.exception("yt-dlp failed for %s", url)
        raise RuntimeError(f"Download failed: {last_exc}") from last_exc

    video_id = info.get("id") or extract_youtube_id(url)
    ext = "flac" if audio_format == "flac" else "mp3"
    candidates = list(tmp.glob(f"*.{ext}"))
    if not candidates:
        candidates = [
            p
            for p in tmp.glob("*.*")
            if p.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp", ".vtt", ".json", ".ytdl")
        ]
    if not candidates:
        shutil.rmtree(tmp, ignore_errors=True)
        raise RuntimeError("No audio file produced")

    audio_path = candidates[0]
    thumb = None
    for t in tmp.glob("*"):
        if t.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp") and t != audio_path:
            thumb = t
            break

    meta = {
        "video_id": video_id,
        "title": title_override or info.get("track") or info.get("title") or "Unknown Title",
        "artist": artist_override or info.get("artist") or info.get("uploader") or "Unknown Artist",
        "duration": info.get("duration") or info.get("duration_string"),
        "webpage_url": info.get("webpage_url") or url,
    }
    try:
        if audio_format == "flac":
            audio = FLAC(audio_path)
            if audio.info and getattr(audio.info, "length", None):
                meta["duration"] = int(audio.info.length)
        else:
            audio = MP3(audio_path)
            if audio.info and getattr(audio.info, "length", None):
                meta["duration"] = int(audio.info.length)
    except Exception:
        pass
    if isinstance(meta.get("duration"), float):
        meta["duration"] = int(meta["duration"])

    try:
        from app.services.artist_normalize import normalize_for_library

        meta["artist"] = normalize_for_library(meta["artist"])
    except Exception:
        logger.exception("artist normalize failed")

    return meta, audio_path, thumb


def _embed_art(audio_path: Path, thumb_path: Path, audio_format: str) -> None:
    data = thumb_path.read_bytes()
    mime = "image/jpeg"
    if thumb_path.suffix.lower() == ".png":
        mime = "image/png"

    if audio_format == "flac":
        audio = FLAC(audio_path)
        pic = Picture()
        pic.type = 3
        pic.mime = mime
        pic.desc = "Cover"
        pic.data = data
        audio.clear_pictures()
        audio.add_picture(pic)
        audio.save()
    else:
        try:
            tags = ID3(audio_path)
        except Exception:
            tags = ID3()
        tags.delall("APIC")
        tags.add(APIC(encoding=3, mime=mime, type=3, desc="Cover", data=data))
        tags.save(audio_path)


def _extract_art_to_jpeg(audio_path: Path, dest: Path, audio_format: str) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if audio_format == "flac":
        audio = FLAC(audio_path)
        if audio.pictures:
            dest.write_bytes(audio.pictures[0].data)
            return True
    else:
        try:
            tags = ID3(audio_path)
            for key in tags.keys():
                if key.startswith("APIC"):
                    dest.write_bytes(tags[key].data)
                    return True
        except Exception:
            pass
    return False


def persist_download(
    meta: dict,
    audio_tmp: Path,
    thumb_tmp: Optional[Path],
    audio_format: str,
) -> Tuple[str, str, int, Optional[str], AudioFormat, TrackSource, str]:
    """
    Move files into MUSIC_ROOT. Returns fields for Track row.
    """
    fmt = AudioFormat.FLAC if audio_format == "flac" else AudioFormat.MP3
    ext = fmt.value
    relative = new_track_relative_path(meta["artist"], meta["title"], ext)
    dest = track_file_path(relative)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(audio_tmp), str(dest))

    if thumb_tmp and thumb_tmp.is_file():
        try:
            _embed_art(dest, thumb_tmp, audio_format)
        except Exception as exc:
            logger.warning("Failed to embed art: %s", exc)

    art_rel = new_art_relative_path(relative)
    art_dest = track_file_path(art_rel)
    if thumb_tmp and thumb_tmp.is_file():
        shutil.copy2(thumb_tmp, art_dest)
    elif not _extract_art_to_jpeg(dest, art_dest, audio_format):
        art_rel = None

    size = dest.stat().st_size
    source_key = f"youtube:{meta['video_id']}"
    return (
        source_key,
        relative,
        size,
        art_rel,
        fmt,
        TrackSource.YOUTUBE,
        meta["webpage_url"],
    )
