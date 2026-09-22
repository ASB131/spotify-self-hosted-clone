"""Filesystem paths under MUSIC_ROOT."""

import os
import re
import uuid
from pathlib import Path

from app.config import get_settings

settings = get_settings()


def music_root() -> Path:
    return Path(settings.music_root)


def safe_filename(name: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*]', "", name).strip()
    return cleaned[:200] or "track"


def track_file_path(relative: str) -> Path:
    root = music_root().resolve()
    full = (root / relative).resolve()
    if not str(full).startswith(str(root)):
        raise ValueError("Invalid track path")
    return full


def art_file_path(relative: str) -> Path:
    return track_file_path(relative)


def new_track_relative_path(artist: str, title: str, ext: str) -> str:
    folder = f"{safe_filename(artist)} - {safe_filename(title)}"
    filename = f"{uuid.uuid4().hex}.{ext.lstrip('.')}"
    return str(Path(folder) / filename)


def new_art_relative_path(track_relative: str) -> str:
    p = Path(track_relative)
    return str(p.with_suffix(".jpg"))
