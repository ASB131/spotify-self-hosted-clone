"""FastAPI application entrypoint."""

import asyncio
import logging
import re

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.types import ASGIApp, Receive, Scope, Send

from app.api.v1 import api_router
from app.config import get_settings
from app.services.events import start_event_listener
from app.websocket.manager import ws_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
settings = get_settings()

limiter = Limiter(key_func=get_remote_address)

fastapi_app = FastAPI(title="Self-Hosted Music API", version="1.0.0")
fastapi_app.state.limiter = limiter
fastapi_app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

fastapi_app.include_router(api_router)


@fastapi_app.on_event("startup")
async def on_startup() -> None:
    loop = asyncio.get_running_loop()

    def forward(user_id: int, event: str, data: dict) -> None:
        asyncio.run_coroutine_threadsafe(ws_manager.send_to_user(user_id, event, data), loop)

    start_event_listener(forward)
    logger.info("Redis → WebSocket event relay started")


@fastapi_app.get("/health")
def health():
    return {"status": "ok"}


@fastapi_app.get("/")
def root():
    return {"service": "self-hosted-music-api"}


class ChromeExtensionCorsASGI:
    """Allow chrome-extension:// origins; prefer background-worker API calls from the extension."""

    _EXT = re.compile(r"^chrome-extension://[a-z]{32}$")

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        origin = headers.get("origin", "")
        is_ext = bool(self._EXT.match(origin))

        if scope.get("method") == "OPTIONS" and is_ext:
            await send(
                {
                    "type": "http.response.start",
                    "status": 200,
                    "headers": [
                        (b"access-control-allow-origin", origin.encode()),
                        (b"access-control-allow-credentials", b"true"),
                        (b"access-control-allow-methods", b"GET, POST, PUT, PATCH, DELETE, OPTIONS"),
                        (b"access-control-allow-headers", b"Authorization, Content-Type, Accept"),
                        (b"access-control-max-age", b"600"),
                        (b"content-length", b"0"),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": b""})
            return

        async def send_with_cors(message):
            if is_ext and message["type"] == "http.response.start":
                raw = list(message.get("headers") or [])
                filtered = [
                    (k, v)
                    for k, v in raw
                    if k.decode().lower()
                    not in (
                        "access-control-allow-origin",
                        "access-control-allow-credentials",
                    )
                ]
                filtered.extend(
                    [
                        (b"access-control-allow-origin", origin.encode()),
                        (b"access-control-allow-credentials", b"true"),
                    ]
                )
                message = {**message, "headers": filtered}
            await send(message)

        await self.app(scope, receive, send_with_cors if is_ext else send)


app = ChromeExtensionCorsASGI(fastapi_app)
