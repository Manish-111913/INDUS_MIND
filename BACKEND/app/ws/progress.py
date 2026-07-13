"""WebSocket fan-out over Redis pub/sub (docs/02 §33, §35).

The pipeline runs in the worker process; the WS connections live in the API
process. They meet on a per-tenant Redis channel: the pipeline PUBLISHes progress
here, the connection manager relays it to that tenant's sockets.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from app.core.redis import get_redis


def tenant_channel(tenant_id: uuid.UUID | str) -> str:
    return f"ws:tenant:{tenant_id}"


async def publish(tenant_id: uuid.UUID | str, message: dict[str, Any]) -> None:
    await get_redis().publish(tenant_channel(tenant_id), json.dumps(message, default=str))


async def publish_progress(tenant_id: uuid.UUID | str, *, job_id, stage: str, pct: int,
                           detail: str | None = None) -> None:
    await publish(tenant_id, {
        "type": "ingestion.progress",
        "job_id": str(job_id),
        "stage": stage,
        "pct": pct,
        "detail": detail,
    })
