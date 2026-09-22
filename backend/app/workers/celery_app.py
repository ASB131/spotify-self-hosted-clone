"""Celery application and beat schedule."""

from celery import Celery
from celery.schedules import crontab

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

celery_app.conf.beat_schedule = {
    "spotify-sync-hourly": {
        "task": "app.workers.tasks.sync_all_spotify_libraries",
        "schedule": crontab(minute=15),
    },
    "discovery-weekly-monday": {
        "task": "app.workers.tasks.refresh_all_discovery",
        "schedule": crontab(hour=3, minute=0, day_of_week=1),
    },
}
