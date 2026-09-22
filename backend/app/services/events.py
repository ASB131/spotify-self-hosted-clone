"""Cross-process events: Celery workers publish; API process relays to WebSockets."""

import json
import logging
import threading
from typing import Any

import redis

from app.config import get_settings

logger = logging.getLogger(__name__)

CHANNEL = "resonance:user_events"


def publish_user_event(user_id: int, event: str, data: dict[str, Any]) -> None:
    """Called from Celery workers (and optionally API) to notify connected browsers."""
    try:
        client = redis.Redis.from_url(get_settings().redis_url, decode_responses=True)
        payload = json.dumps({"user_id": user_id, "event": event, "data": data})
        client.publish(CHANNEL, payload)
        client.close()
    except Exception as exc:
        logger.warning("Redis publish failed: %s", exc)


def start_event_listener(forward) -> None:
    """
    Subscribe in a background thread. `forward(user_id, event, data)` must schedule
    async WS sends on the FastAPI event loop.
    """

    def _run() -> None:
        while True:
            try:
                client = redis.Redis.from_url(get_settings().redis_url, decode_responses=True)
                pubsub = client.pubsub(ignore_subscribe_messages=True)
                pubsub.subscribe(CHANNEL)
                for message in pubsub.listen():
                    if message.get("type") != "message":
                        continue
                    try:
                        payload = json.loads(message["data"])
                        forward(int(payload["user_id"]), payload["event"], payload.get("data") or {})
                    except Exception as exc:
                        logger.debug("Bad event payload: %s", exc)
            except Exception as exc:
                logger.warning("Redis listener error (retrying): %s", exc)
                import time

                time.sleep(2)

    thread = threading.Thread(target=_run, name="redis-user-events", daemon=True)
    thread.start()
