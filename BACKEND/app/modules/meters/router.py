"""Meter / condition-data router (docs/05 S5).

Definitions are admin-managed (`readings.manage`); technicians record readings
(`readings.record`); reads require `equip.read`. Reading queries are downsampled
server-side.
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.core.exceptions import ValidationFailed
from app.modules.auth.dependencies import CurrentUser, require
from app.modules.meters.schemas import (
    MeterDefinitionCreate,
    MeterDefinitionRead,
    MeterDefinitionUpdate,
    ReadingCreate,
)
from app.modules.meters.service import MeterService

router = APIRouter(tags=["meters"])


def _def(row) -> dict:
    return MeterDefinitionRead.model_validate(row).model_dump()


# ── meter definitions (admin) ─────────────────────────────────────────────────
@router.get("/meter-definitions", summary="List meter definitions")
async def list_definitions(actor: CurrentUser = Depends(require("equip.read")),
                           session: AsyncSession = Depends(get_session)) -> dict:
    rows = await MeterService(session, actor.tenant_id).list_definitions()
    return success([_def(r) for r in rows])


@router.post("/meter-definitions", status_code=201, summary="Create a meter definition (admin)")
async def create_definition(body: MeterDefinitionCreate,
                            actor: CurrentUser = Depends(require("readings.manage")),
                            session: AsyncSession = Depends(get_session)) -> dict:
    row = await MeterService(session, actor.tenant_id).create_definition(data=body, actor=actor)
    return success(_def(row))


@router.patch("/meter-definitions/{definition_id}", summary="Update a meter definition (admin)")
async def update_definition(definition_id: uuid.UUID, body: MeterDefinitionUpdate,
                            actor: CurrentUser = Depends(require("readings.manage")),
                            session: AsyncSession = Depends(get_session)) -> dict:
    row = await MeterService(session, actor.tenant_id).update_definition(
        definition_id, data=body, actor=actor)
    return success(_def(row))


@router.delete("/meter-definitions/{definition_id}", summary="Delete a meter definition (admin)")
async def delete_definition(definition_id: uuid.UUID,
                            actor: CurrentUser = Depends(require("readings.manage")),
                            session: AsyncSession = Depends(get_session)) -> dict:
    await MeterService(session, actor.tenant_id).delete_definition(definition_id, actor=actor)
    return success({"message": "Meter definition deleted"})


# ── readings ──────────────────────────────────────────────────────────────────
@router.post("/equipment/{equipment_id}/readings", status_code=201, summary="Record a reading")
async def record_reading(equipment_id: uuid.UUID, body: ReadingCreate,
                         actor: CurrentUser = Depends(require("readings.record")),
                         session: AsyncSession = Depends(get_session)) -> dict:
    row = await MeterService(session, actor.tenant_id).record_reading(
        equipment_id, data=body, actor=actor)
    return success({"id": str(row.id), "value": float(row.value),
                    "recorded_at": row.recorded_at.isoformat()})


@router.get("/equipment/{equipment_id}/readings", summary="Read condition series (downsampled)")
async def get_readings(equipment_id: uuid.UUID,
                       meter: str | None = Query(None),
                       date_from: datetime | None = Query(None, alias="from"),
                       date_to: datetime | None = Query(None, alias="to"),
                       max_points: int = Query(500, ge=10, le=5000),
                       actor: CurrentUser = Depends(require("equip.read")),
                       session: AsyncSession = Depends(get_session)) -> dict:
    data = await MeterService(session, actor.tenant_id).readings_for(
        equipment_id, meter_code=meter, date_from=date_from, date_to=date_to,
        max_points=max_points)
    return success(data)


@router.post("/readings/import", summary="Bulk CSV reading import (entity=readings)")
async def import_readings(file: UploadFile = File(...),
                          actor: CurrentUser = Depends(require("readings.record")),
                          session: AsyncSession = Depends(get_session)) -> dict:
    content = (await file.read()).decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(content))
    rows = [{(k or "").strip(): (v or "") for k, v in row.items()} for row in reader]
    if not rows:
        raise ValidationFailed("Empty or invalid CSV", code="VALIDATION_ERROR")
    report = await MeterService(session, actor.tenant_id).import_readings(rows, actor=actor)
    return success(report)
