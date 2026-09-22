"""Real-time events for the authenticated user."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.database import SessionLocal
from app.websocket.manager import ws_manager

router = APIRouter(tags=["websocket"])


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # Authenticate via cookie or ?token= query for simplicity with WS
    token = websocket.cookies.get("access_token") or websocket.query_params.get("token")
    user = None
    if token:
        from app.services.security import TOKEN_TYPE_ACCESS, decode_token
        from app.models.user import User

        payload = decode_token(token)
        if payload and payload.get("type") == TOKEN_TYPE_ACCESS:
            db = SessionLocal()
            try:
                user = db.get(User, int(payload["sub"]))
            finally:
                db.close()

    if not user or not user.is_active:
        await websocket.close(code=4401)
        return

    await ws_manager.connect(user.id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(user.id, websocket)
