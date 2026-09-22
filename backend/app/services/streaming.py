"""HTTP Range streaming with optional FLAC transcoding for unsupported clients."""

import logging
import subprocess
from pathlib import Path
from typing import Optional, Tuple

from fastapi import HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.track import AudioFormat, Track
from app.models.user_track import UserTrack
from app.services.storage_paths import track_file_path

logger = logging.getLogger(__name__)
settings = get_settings()

CHUNK_SIZE = 1024 * 256


def _user_can_stream(db: Session, user_id: int, track: Track) -> bool:
    link = db.scalar(select(UserTrack).where(UserTrack.user_id == user_id, UserTrack.track_id == track.id))
    return link is not None


def _parse_range(range_header: str, file_size: int) -> Tuple[int, int]:
    """Return start, end inclusive for bytes=START-END."""
    if not range_header.startswith("bytes="):
        raise HTTPException(status_code=416, detail="Invalid Range")
    spec = range_header.replace("bytes=", "").strip()
    if spec.startswith(","):
        raise HTTPException(status_code=416, detail="Multiple ranges not supported")
    if "-" not in spec:
        raise HTTPException(status_code=416, detail="Invalid Range")
    start_s, end_s = spec.split("-", 1)
    if start_s == "":
        suffix = int(end_s)
        start = max(0, file_size - suffix)
        end = file_size - 1
    elif end_s == "":
        start = int(start_s)
        end = file_size - 1
    else:
        start = int(start_s)
        end = min(int(end_s), file_size - 1)
    if start > end or start >= file_size:
        raise HTTPException(status_code=416, detail="Range not satisfiable")
    return start, end


def _stream_file_range(path: Path, start: int, end: int, content_type: str) -> StreamingResponse:
    file_size = path.stat().st_size
    length = end - start + 1

    def iter_file():
        with open(path, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(CHUNK_SIZE, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Content-Length": str(length),
    }
    return StreamingResponse(iter_file(), status_code=206, media_type=content_type, headers=headers)


def _client_supports_flac(accept: Optional[str], user_agent: Optional[str]) -> bool:
    """Chrome/Edge/Firefox play FLAC natively; prefer that over on-the-fly transcode."""
    ua = (user_agent or "").lower()
    if any(x in ua for x in ("chrome", "chromium", "edg/", "firefox", "crios")):
        return True
    if not accept:
        return False
    a = accept.lower()
    return "audio/flac" in a or "audio/x-flac" in a


def _transcode_flac_to_mp3_stream(path: Path) -> StreamingResponse:
    """On-the-fly MP3 transcode when browser cannot play FLAC.

    Map audio only — embedded cover art (mjpeg) otherwise breaks ffmpeg.
    """

    def iter_ffmpeg():
        cmd = [
            settings.ffmpeg_path,
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(path),
            "-map",
            "0:a:0",
            "-vn",
            "-f",
            "mp3",
            "-acodec",
            "libmp3lame",
            "-q:a",
            "2",
            "pipe:1",
        ]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            assert proc.stdout is not None
            while True:
                chunk = proc.stdout.read(CHUNK_SIZE)
                if not chunk:
                    break
                yield chunk
        finally:
            if proc.stderr:
                err = proc.stderr.read().decode("utf-8", errors="ignore")
                if err.strip():
                    logger.warning("ffmpeg flac→mp3: %s", err.strip()[:500])
            proc.kill()
            proc.wait()

    return StreamingResponse(
        iter_ffmpeg(),
        media_type="audio/mpeg",
        headers={"Accept-Ranges": "none", "Cache-Control": "no-store"},
    )


def stream_track(db: Session, user_id: int, track_id: int, request: Request) -> Response:
    track = db.get(Track, track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    if not _user_can_stream(db, user_id, track):
        raise HTTPException(status_code=403, detail="Track not in your library")

    try:
        path = track_file_path(track.relative_path)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid storage path")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Audio file missing on disk")

    force_mp3 = request.query_params.get("transcode") == "mp3"
    accept = request.headers.get("accept")
    ua = request.headers.get("user-agent")
    range_header = request.headers.get("range")

    if track.format == AudioFormat.FLAC and (force_mp3 or not _client_supports_flac(accept, ua)):
        return _transcode_flac_to_mp3_stream(path)

    content_type = "audio/mpeg" if track.format == AudioFormat.MP3 else "audio/flac"
    file_size = path.stat().st_size

    if range_header:
        start, end = _parse_range(range_header, file_size)
        return _stream_file_range(path, start, end, content_type)

    def iter_full():
        with open(path, "rb") as f:
            while True:
                chunk = f.read(CHUNK_SIZE)
                if not chunk:
                    break
                yield chunk

    return StreamingResponse(
        iter_full(),
        media_type=content_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
        },
    )
