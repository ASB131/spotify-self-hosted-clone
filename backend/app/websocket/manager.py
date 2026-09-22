"""WebSocket connection manager for per-user download events."""

import asyncio
import json
import logging
from typing import Any, Dict, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: Dict[int, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.setdefault(user_id, set()).add(websocket)

    async def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            conns = self._connections.get(user_id)
            if conns and websocket in conns:
                conns.discard(websocket)
                if not conns:
                    del self._connections[user_id]

    async def send_to_user(self, user_id: int, event: str, data: dict[str, Any]) -> None:
        message = json.dumps({"event": event, "data": data})
        async with self._lock:
            conns = list(self._connections.get(user_id, set()))
        dead: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_text(message)
            except Exception as exc:
                logger.debug("WS send failed: %s", exc)
                dead.append(ws)
        for ws in dead:
            await self.disconnect(user_id, ws)


ws_manager = ConnectionManager()
