"""Keep download_jobs from growing without bound."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.download_job import DownloadJob, JobStatus

# Finished jobs older than this many (per user) are deleted automatically.
KEEP_FINISHED = 25


def prune_finished_jobs(db: Session, user_id: int | None = None) -> int:
    """Delete finished jobs beyond KEEP_FINISHED newest per user. Returns rows removed."""
    q = select(DownloadJob).where(
        DownloadJob.status.in_((JobStatus.COMPLETED, JobStatus.FAILED))
    )
    if user_id is not None:
        q = q.where(DownloadJob.user_id == user_id)
    rows = list(db.scalars(q.order_by(DownloadJob.created_at.desc())).all())

    removed = 0
    counts: dict[int, int] = {}
    for job in rows:
        n = counts.get(job.user_id, 0) + 1
        counts[job.user_id] = n
        if n > KEEP_FINISHED:
            db.delete(job)
            removed += 1
    if removed:
        db.commit()
    return removed
