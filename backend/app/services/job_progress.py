"""Update DownloadJob rows and notify the UI."""

from typing import Optional

from sqlalchemy.orm import Session

from app.models.download_job import DownloadJob, JobStatus
from app.services.events import publish_user_event


def update_job(
    db: Session,
    job_id: int,
    *,
    status: Optional[JobStatus] = None,
    progress: Optional[int] = None,
    stage: Optional[str] = None,
    error: Optional[str] = None,
    track_id: Optional[int] = None,
    title: Optional[str] = None,
    artist: Optional[str] = None,
) -> Optional[DownloadJob]:
    job = db.get(DownloadJob, job_id)
    if not job:
        return None
    if status is not None:
        job.status = status
    if progress is not None:
        job.progress = max(0, min(100, progress))
    if stage is not None:
        job.stage = stage
    if error is not None:
        job.error = error[:2000]
    if track_id is not None:
        job.track_id = track_id
    if title:
        job.title = title
    if artist:
        job.artist = artist
    db.add(job)
    db.commit()
    db.refresh(job)
    publish_user_event(
        job.user_id,
        "download_progress",
        {
            "job_id": job.id,
            "status": job.status.value,
            "progress": job.progress,
            "stage": job.stage,
            "title": job.title,
            "artist": job.artist,
            "error": job.error,
            "track_id": job.track_id,
            "url": job.url,
        },
    )
    return job
