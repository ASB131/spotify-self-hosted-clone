"""Celery application and beat schedule."""

from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "music_workers",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
)

# No periodic Spotify sync or discovery refresh — library is YouTube-extension only.
celery_app.conf.beat_schedule = {}
