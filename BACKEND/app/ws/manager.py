"""WebSocket connection manager (docs/02 §35).

Per connection: subscribe to the socket's tenant Redis channel and relay messages
to the client, while a reader task detects disconnects. Tenant isolation comes
from the channel name derived from the authenticated token.
"""

from __future__ import annotations

import asyncio
import uuid

from starlette.websockets import WebSocket, WebSocketDisconnect

from app.core.logging import get_logger
from app.core.redis import get_redis
from app.ws import progress

log = get_logger("ws.manager")


class ConnectionManager:
    async def serve(self, websocket: WebSocket, tenant_id: uuid.UUID | str) -> None:
        await websocket.accept()
        pubsub = get_redis().pubsub()
        await pubsub.subscribe(progress.tenant_channel(tenant_id))
        # Ack once the tenant channel is live so the client knows it won't miss events.
        await websocket.send_json({"type": "connected", "tenant_id": str(tenant_id)})
        log.info("ws_connected", tenant_id=str(tenant_id))
        relay = asyncio.create_task(self._relay(pubsub, websocket))
        reader = asyncio.create_task(self._read(websocket))
        try:
            done, pending = await asyncio.wait({relay, reader},
                                               return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
        finally:
            await pubsub.unsubscribe(progress.tenant_channel(tenant_id))
            await pubsub.aclose()
            log.info("ws_disconnected", tenant_id=str(tenant_id))

    async def _relay(self, pubsub, websocket: WebSocket) -> None:
        async for message in pubsub.listen():
            if message.get("type") == "message":
                try:
                    await websocket.send_text(message["data"])
                except Exception:  # noqa: BLE001 — socket closed
                    return

    async def _read(self, websocket: WebSocket) -> None:
        try:
            while True:
                await websocket.receive_text()  # client pings / close
        except WebSocketDisconnect:
            return


manager = ConnectionManager()
