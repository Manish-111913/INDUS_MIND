"""Equipment QR codes & label sheets (docs/08 N2).

`GET /equipment/{id}/qr` renders a PNG encoding {app.base_url}/eq/{code};
`GET /equipment/by-code/{code}` resolves a scanned code back to the asset;
`POST /equipment/labels` renders an A4 label sheet PDF, delivered via the S6
export mechanism with an export.completed notification.
"""

from __future__ import annotations

import io
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.core.exceptions import NotFound
from app.modules.auth.dependencies import CurrentUser, require
from app.modules.equipment.models import Equipment
from app.modules.equipment.schemas import EquipmentRead

router = APIRouter(tags=["equipment-qr"])


async def _app_base_url(session: AsyncSession, tenant_id) -> str:
    from app.modules.settings.service import SettingsService

    try:
        return (await SettingsService(session, tenant_id).effective(None)).get(
            "app.base_url", "http://localhost:3000")
    except Exception:  # noqa: BLE001
        return "http://localhost:3000"


def render_qr_png(content: str) -> bytes:
    import qrcode

    img = qrcode.make(content)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@router.get("/equipment/by-code/{code}", summary="Resolve a scanned QR code to an asset")
async def by_code(
    code: str,
    actor: CurrentUser = Depends(require("equip.read")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Tenant-scoped, 404-safe: a code from another tenant looks like any unknown
    code, so scanning never leaks whether an asset exists elsewhere."""
    row = (await session.execute(
        select(Equipment).where(Equipment.tenant_id == actor.tenant_id, Equipment.tag == code)
    )).scalar_one_or_none()
    if row is None:
        raise NotFound("Equipment not found for that code", code="EQUIPMENT_NOT_FOUND")
    return success(EquipmentRead.model_validate(row).model_dump())


@router.get("/equipment/{equipment_id}/qr", summary="QR code PNG for an asset")
async def equipment_qr(
    equipment_id: uuid.UUID,
    actor: CurrentUser = Depends(require("equip.read")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    row = (await session.execute(
        select(Equipment).where(Equipment.id == equipment_id,
                                Equipment.tenant_id == actor.tenant_id))).scalar_one_or_none()
    if row is None:
        raise NotFound("Equipment not found", code="EQUIPMENT_NOT_FOUND")
    base = await _app_base_url(session, actor.tenant_id)
    png = render_qr_png(f"{base}/eq/{row.tag}")
    return Response(content=png, media_type="image/png",
                    headers={"Cache-Control": "private, max-age=3600"})


class LabelRequest(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=200)


@router.post("/equipment/labels", status_code=202, summary="Render an A4 label sheet (async)")
async def equipment_labels(
    body: LabelRequest,
    actor: CurrentUser = Depends(require("equip.read")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Queues a Celery task that renders a 3×8 QR label grid to PDF and delivers
    it through the export mechanism (docs/08 N2). 202 + job id — rendering a
    sheet of QR codes is too slow for a request."""
    from app.workers.tasks.equipment_tasks import render_label_sheet

    result = render_label_sheet.delay(str(actor.tenant_id), str(actor.id),
                                      [str(i) for i in body.ids])
    return success({"job_id": str(result.id), "status": "queued",
                    "detail": "Your label sheet is rendering; you'll be notified when it's ready."})
