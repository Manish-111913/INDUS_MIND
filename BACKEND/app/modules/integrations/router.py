"""Integration-layer admin router (docs/05 S8) — /admin/api-keys, /admin/webhooks."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.core.exceptions import ValidationFailed
from app.modules.auth.dependencies import CurrentUser, require
from app.modules.integrations import events as _events  # noqa: F401 — registers webhook fan-out
from app.modules.integrations.keys_service import ApiKeyService
from app.modules.integrations.schemas import (
    ApiKeyCreate,
    ApiKeyCreated,
    ApiKeyRead,
    WebhookDeliveryRead,
    WebhookEndpointCreate,
    WebhookEndpointCreated,
    WebhookEndpointRead,
    WebhookEndpointUpdate,
)
from app.modules.integrations.webhooks_service import WebhookService
from app.modules.users.catalog import ALL_PERMISSION_CODES

router = APIRouter(prefix="/admin", tags=["integrations"])

PERM = "integrations.manage"


# ── api keys ─────────────────────────────────────────────────────────────────
@router.get("/api-keys", summary="List API keys")
async def list_keys(
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await ApiKeyService(session, actor.tenant_id).list()
    return success([ApiKeyRead.model_validate(r).model_dump() for r in rows])


@router.post("/api-keys", status_code=201, summary="Create an API key (plaintext shown once)")
async def create_key(
    body: ApiKeyCreate,
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    # A key must never be able to grant more than the system defines — an unknown
    # scope would sit in the row looking effective while matching no permission.
    unknown = sorted(set(body.scopes) - ALL_PERMISSION_CODES)
    if unknown:
        raise ValidationFailed(f"Unknown scopes: {unknown}", code="API_KEY_UNKNOWN_SCOPE",
                               http_status=422)
    # Nor may an admin mint a key more powerful than themselves.
    escalation = sorted(set(body.scopes) - set(actor.perms))
    if escalation:
        raise ValidationFailed(
            f"Cannot grant scopes you do not hold: {escalation}",
            code="API_KEY_SCOPE_ESCALATION", http_status=422)

    svc = ApiKeyService(session, actor.tenant_id)
    row, plaintext = await svc.create(name=body.name, scopes=body.scopes,
                                      expires_at=body.expires_at, actor_id=actor.id)
    await session.commit()
    await session.refresh(row)
    payload = ApiKeyRead.model_validate(row).model_dump()
    return success(ApiKeyCreated(**payload, key=plaintext).model_dump())


@router.delete("/api-keys/{key_id}", status_code=204, summary="Revoke an API key")
async def revoke_key(
    key_id: uuid.UUID,
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> None:
    await ApiKeyService(session, actor.tenant_id).revoke(key_id, actor.id)
    await session.commit()


# ── webhook endpoints ────────────────────────────────────────────────────────
@router.get("/webhooks", summary="List webhook endpoints")
async def list_endpoints(
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await WebhookService(session, actor.tenant_id).list_endpoints()
    return success([WebhookEndpointRead.model_validate(r).model_dump() for r in rows])


@router.post("/webhooks", status_code=201, summary="Create a webhook endpoint")
async def create_endpoint(
    body: WebhookEndpointCreate,
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    svc = WebhookService(session, actor.tenant_id)
    row = await svc.create_endpoint(name=body.name, url=body.url,
                                    event_codes=body.event_codes, actor_id=actor.id)
    secret = row.secret
    await session.commit()
    await session.refresh(row)
    payload = WebhookEndpointRead.model_validate(row).model_dump()
    return success(WebhookEndpointCreated(**payload, secret=secret).model_dump())


@router.patch("/webhooks/{endpoint_id}", summary="Update a webhook endpoint")
async def update_endpoint(
    endpoint_id: uuid.UUID,
    body: WebhookEndpointUpdate,
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    svc = WebhookService(session, actor.tenant_id)
    row = await svc.update_endpoint(endpoint_id, body.model_dump(exclude_unset=True), actor.id)
    await session.commit()
    await session.refresh(row)
    return success(WebhookEndpointRead.model_validate(row).model_dump())


@router.delete("/webhooks/{endpoint_id}", status_code=204, summary="Delete a webhook endpoint")
async def delete_endpoint(
    endpoint_id: uuid.UUID,
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> None:
    await WebhookService(session, actor.tenant_id).delete_endpoint(endpoint_id)
    await session.commit()


@router.post("/webhooks/{endpoint_id}/test", summary="Send a test event to an endpoint")
async def test_endpoint(
    endpoint_id: uuid.UUID,
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Delivers synchronously so the admin sees the real result — status code and
    error — rather than a queued job they have to go hunting for."""
    svc = WebhookService(session, actor.tenant_id)
    endpoint = await svc.get_endpoint(endpoint_id)
    delivery = await svc.enqueue(endpoint, "webhook.test", {
        "event": "webhook.test",
        "endpoint_id": str(endpoint.id),
        "message": "Test event from IndusMind.",
    })
    await svc.attempt(delivery)
    await session.commit()
    await session.refresh(delivery)
    return success(WebhookDeliveryRead.model_validate(delivery).model_dump())


# ── deliveries ───────────────────────────────────────────────────────────────
@router.get("/webhooks/deliveries", summary="List webhook deliveries")
async def list_deliveries(
    endpoint_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await WebhookService(session, actor.tenant_id).list_deliveries(
        endpoint_id=endpoint_id, status=status, limit=limit)
    return success([WebhookDeliveryRead.model_validate(r).model_dump() for r in rows])


@router.post("/webhooks/deliveries/{delivery_id}/retry", summary="Retry a delivery")
async def retry_delivery(
    delivery_id: uuid.UUID,
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    svc = WebhookService(session, actor.tenant_id)
    row = await svc.retry(delivery_id)
    await session.commit()
    await session.refresh(row)
    return success(WebhookDeliveryRead.model_validate(row).model_dump())
