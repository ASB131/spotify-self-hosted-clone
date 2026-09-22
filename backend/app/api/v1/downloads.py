"""Queue download jobs from web or extension."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.download_job import DownloadJob, JobStatus
from app.models.playlist import Playlist
from app.models.user import User
from app.schemas.auth import DownloadRequest
from app.services.events import publish_user_event
from app.services.job_prune import prune_finished_jobs
from app.workers.tasks import download_youtube_track
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/downloads", tags=["downloads"])


class DownloadJobPublic(BaseModel):
    id: int
    celery_task_id: Optional[str]
    url: str
    title: Optional[str]
    artist: Optional[str]
    audio_format: str
    status: str
    progress: int
    stage: str
    error: Optional[str]
    track_id: Optional[int]

    model_config = {"from_attributes": True}


@router.post("")
def queue_download(body: DownloadRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.playlist_id:
        pl = db.get(Playlist, body.playlist_id)
        if not pl or pl.user_id != user.id:
            raise HTTPException(status_code=404, detail="Playlist not found")

    if user.storage_used_bytes >= user.storage_quota_bytes:
        raise HTTPException(status_code=403, detail="Storage quota exceeded")

    fmt = body.format.lower()
    if fmt not in ("mp3", "flac"):
        raise HTTPException(status_code=400, detail="format must be mp3 or flac")

    job = DownloadJob(
        user_id=user.id,
        url=body.url,
        title=body.title,
        artist=body.artist,
        audio_format=fmt,
        status=JobStatus.QUEUED,
        progress=0,
        stage="Queued: waiting for worker",
        added_via=body.added_via or "extension",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Always land in All Songs; optional playlist_id adds a second membership.
    task = download_youtube_track.delay(
        user_id=user.id,
        url=body.url,
        title=body.title,
        artist=body.artist,
        audio_format=fmt,
        playlist_id=body.playlist_id,
        add_to_liked=True,
        job_id=job.id,
        added_via=body.added_via or "extension",
    )
    job.celery_task_id = task.id
    db.add(job)
    db.commit()

    publish_user_event(
        user.id,
        "download_progress",
        {
            "job_id": job.id,
            "status": job.status.value,
            "progress": 0,
            "stage": job.stage,
            "title": job.title,
            "artist": job.artist,
            "error": None,
            "track_id": None,
            "url": job.url,
        },
    )
    return {"task_id": task.id, "job_id": job.id, "status": "queued"}


@router.get("/jobs", response_model=list[DownloadJobPublic])
def list_jobs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    prune_finished_jobs(db, user.id)
    rows = db.scalars(
        select(DownloadJob).where(DownloadJob.user_id == user.id).order_by(DownloadJob.created_at.desc()).limit(50)
    ).all()
    return [
        DownloadJobPublic(
            id=j.id,
            celery_task_id=j.celery_task_id,
            url=j.url,
            title=j.title,
            artist=j.artist,
            audio_format=j.audio_format,
            status=j.status.value,
            progress=j.progress,
            stage=j.stage,
            error=j.error,
            track_id=j.track_id,
        )
        for j in rows
    ]


@router.delete("/jobs")
def clear_jobs(
    finished_only: bool = True,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove finished (or all) download log rows for the current user."""
    q = select(DownloadJob).where(DownloadJob.user_id == user.id)
    rows = list(db.scalars(q).all())
    removed = 0
    for job in rows:
        if finished_only and job.status not in (JobStatus.COMPLETED, JobStatus.FAILED):
            continue
        db.delete(job)
        removed += 1
    db.commit()
    return {"removed": removed}

