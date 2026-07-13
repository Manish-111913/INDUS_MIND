"""WebSocket routes (docs/02 §35). Auth on connect via `?token=` (access JWT)."""

from __future__ import annotations

import uuid

import jwt
from fastapi import APIRouter, Query, WebSocket

from app.core.logging import get_logger
from app.core.security import decode_jwt
from app.ws.manager import manager

log = get_logger("ws.router")
router = APIRouter()

WS_UNAUTHORIZED = 4401


def _tenant_from_token(token: str | None) -> uuid.UUID | None:
    if not token:
        return None
    try:
        claims = decode_jwt(token)
    except jwt.PyJWTError:
        return None
    if claims.get("typ") != "access":
        return None
    try:
        return uuid.UUID(claims["tenant_id"])
    except (KeyError, ValueError):
        return None


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket, token: str | None = Query(default=None)) -> None:
    tenant_id = _tenant_from_token(token)
    if tenant_id is None:
        await websocket.close(code=WS_UNAUTHORIZED)
        return
    await manager.serve(websocket, tenant_id)
