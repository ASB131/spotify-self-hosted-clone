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
    bytes_downloaded: Optional[int] = None,
    bytes_total: Optional[int] = None,
    speed_bps: Optional[int] = None,
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
    if bytes_downloaded is not None:
        job.bytes_downloaded = max(0, int(bytes_downloaded))
    if bytes_total is not None:
        job.bytes_total = max(0, int(bytes_total)) if bytes_total else None
    if speed_bps is not None:
        job.speed_bps = max(0, int(speed_bps))
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
            "audio_format": job.audio_format,
            "bytes_downloaded": job.bytes_downloaded,
            "bytes_total": job.bytes_total,
            "speed_bps": job.speed_bps,
        },
    )
    if job.status in (JobStatus.COMPLETED, JobStatus.FAILED):
        from app.services.job_prune import prune_finished_jobs

        prune_finished_jobs(db, job.user_id)
    return job
