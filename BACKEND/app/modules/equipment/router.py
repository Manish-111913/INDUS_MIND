"""Equipment / plants / areas HTTP router (docs/02 §14, §23).

Reads require `equip.read`; writes require `equip.manage`. Special equipment
routes (tree/resolve/import) are declared before `/equipment/{id}` so the id
path doesn't shadow them.
"""

from __future__ import annotations

import csv
import io
import uuid

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams
from app.common.responses import success
from app.core.database import get_session
from app.core.exceptions import ValidationFailed
from app.modules.auth.dependencies import CurrentUser, require
from app.modules.equipment import events as _events  # noqa: F401 — registers cache subscriber
from app.modules.equipment.schemas import (
    AreaCreate,
    AreaRead,
    AreaUpdate,
    EquipmentCreate,
    EquipmentRead,
    EquipmentUpdate,
    PlantCreate,
    PlantRead,
    PlantUpdate,
)
from app.modules.equipment.service import AreaService, EquipmentService, PlantService

router = APIRouter(tags=["equipment"])


def _page(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
          sort: str | None = Query("-created_at")) -> PageParams:
    return PageParams(page=page, page_size=page_size, sort=sort)


# ── plants ───────────────────────────────────────────────────────────────────
@router.get("/plants", summary="List plants")
async def list_plants(params: PageParams = Depends(_page),
                      actor: CurrentUser = Depends(require("equip.read")),
                      session: AsyncSession = Depends(get_session)) -> dict:
    page = await PlantService(session, actor.tenant_id).list(params)
    return success([PlantRead.model_validate(p).model_dump() for p in page.items], meta=page.meta)


@router.post("/plants", status_code=201, summary="Create a plant")
async def create_plant(body: PlantCreate, actor: CurrentUser = Depends(require("equip.manage")),
                       session: AsyncSession = Depends(get_session)) -> dict:
    plant = await PlantService(session, actor.tenant_id).create(
        name=body.name, code=body.code, location=body.location, timezone=body.timezone, actor=actor)
    return success(PlantRead.model_validate(plant).model_dump())


@router.get("/plants/{plant_id}", summary="Get a plant")
async def get_plant(plant_id: uuid.UUID, actor: CurrentUser = Depends(require("equip.read")),
                    session: AsyncSession = Depends(get_session)) -> dict:
    plant = await PlantService(session, actor.tenant_id).get(plant_id)
    return success(PlantRead.model_validate(plant).model_dump())


@router.patch("/plants/{plant_id}", summary="Update a plant")
async def update_plant(plant_id: uuid.UUID, body: PlantUpdate,
                       actor: CurrentUser = Depends(require("equip.manage")),
                       session: AsyncSession = Depends(get_session)) -> dict:
    plant = await PlantService(session, actor.tenant_id).update(plant_id, data=body, actor=actor)
    return success(PlantRead.model_validate(plant).model_dump())


@router.delete("/plants/{plant_id}", summary="Delete a plant")
async def delete_plant(plant_id: uuid.UUID, actor: CurrentUser = Depends(require("equip.manage")),
                       session: AsyncSession = Depends(get_session)) -> dict:
    await PlantService(session, actor.tenant_id).delete(plant_id, actor=actor)
    return success({"message": "Plant deleted"})


# ── areas ────────────────────────────────────────────────────────────────────
@router.get("/areas", summary="List areas")
async def list_areas(params: PageParams = Depends(_page),
                     plant_id: uuid.UUID | None = Query(None),
                     actor: CurrentUser = Depends(require("equip.read")),
                     session: AsyncSession = Depends(get_session)) -> dict:
    page = await AreaService(session, actor.tenant_id).list(params, plant_id=plant_id)
    return success([AreaRead.model_validate(a).model_dump() for a in page.items], meta=page.meta)


@router.post("/areas", status_code=201, summary="Create an area")
async def create_area(body: AreaCreate, actor: CurrentUser = Depends(require("equip.manage")),
                      session: AsyncSession = Depends(get_session)) -> dict:
    area = await AreaService(session, actor.tenant_id).create(
        plant_id=body.plant_id, name=body.name, code=body.code, actor=actor)
    return success(AreaRead.model_validate(area).model_dump())


@router.get("/areas/{area_id}", summary="Get an area")
async def get_area(area_id: uuid.UUID, actor: CurrentUser = Depends(require("equip.read")),
                   session: AsyncSession = Depends(get_session)) -> dict:
    area = await AreaService(session, actor.tenant_id).get(area_id)
    return success(AreaRead.model_validate(area).model_dump())


@router.patch("/areas/{area_id}", summary="Update an area")
async def update_area(area_id: uuid.UUID, body: AreaUpdate,
                      actor: CurrentUser = Depends(require("equip.manage")),
                      session: AsyncSession = Depends(get_session)) -> dict:
    area = await AreaService(session, actor.tenant_id).update(area_id, data=body, actor=actor)
    return success(AreaRead.model_validate(area).model_dump())


@router.delete("/areas/{area_id}", summary="Delete an area")
async def delete_area(area_id: uuid.UUID, actor: CurrentUser = Depends(require("equip.manage")),
                      session: AsyncSession = Depends(get_session)) -> dict:
    await AreaService(session, actor.tenant_id).delete(area_id, actor=actor)
    return success({"message": "Area deleted"})


# ── equipment: special routes (declared before /equipment/{id}) ──────────────
@router.get("/equipment/tree", summary="Equipment hierarchy for a plant (cached 10m)")
async def equipment_tree(plant_id: uuid.UUID = Query(...),
                         actor: CurrentUser = Depends(require("equip.read")),
                         session: AsyncSession = Depends(get_session)) -> dict:
    tree = await EquipmentService(session, actor.tenant_id).tree(plant_id)
    return success(tree)


@router.get("/equipment/resolve", summary="Fuzzy tag → equipment (pg_trgm)")
async def resolve_equipment(tag: str = Query(..., min_length=1),
                            actor: CurrentUser = Depends(require("equip.read")),
                            session: AsyncSession = Depends(get_session)) -> dict:
    matches = await EquipmentService(session, actor.tenant_id).resolve(tag)
    return success({"query": tag, "matches": matches, "best": matches[0] if matches else None})


@router.post("/equipment/import", summary="Bulk CSV import with row-level report")
async def import_equipment(file: UploadFile = File(...),
                           actor: CurrentUser = Depends(require("equip.manage")),
                           session: AsyncSession = Depends(get_session)) -> dict:
    content = (await file.read()).decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(content))
    rows = [{(k or "").strip(): (v or "") for k, v in row.items()} for row in reader]
    if not rows:
        raise ValidationFailed("Empty or invalid CSV", code="VALIDATION_ERROR")
    report = await EquipmentService(session, actor.tenant_id).bulk_import(rows, actor=actor)
    return success(report.model_dump())


# ── equipment CRUD ───────────────────────────────────────────────────────────
@router.get("/equipment", summary="List equipment (filters + pagination)")
async def list_equipment(
    params: PageParams = Depends(_page),
    area_id: uuid.UUID | None = Query(None),
    type_id: uuid.UUID | None = Query(None),
    criticality: str | None = Query(None),
    status: str | None = Query(None),
    health_band: str | None = Query(None, pattern="^(good|fair|poor)$"),
    q: str | None = Query(None),
    actor: CurrentUser = Depends(require("equip.read")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    page = await EquipmentService(session, actor.tenant_id).list(
        params, area_id=area_id, type_id=type_id, criticality=criticality,
        status=status, health_band=health_band, q=q)
    return success([EquipmentRead.model_validate(e).model_dump() for e in page.items], meta=page.meta)


@router.post("/equipment", status_code=201, summary="Create equipment")
async def create_equipment(body: EquipmentCreate,
                           actor: CurrentUser = Depends(require("equip.manage")),
                           session: AsyncSession = Depends(get_session)) -> dict:
    equipment = await EquipmentService(session, actor.tenant_id).create(data=body, actor=actor)
    return success(EquipmentRead.model_validate(equipment).model_dump())


@router.get("/equipment/{equipment_id}", summary="Get equipment")
async def get_equipment(equipment_id: uuid.UUID,
                        actor: CurrentUser = Depends(require("equip.read")),
                        session: AsyncSession = Depends(get_session)) -> dict:
    equipment = await EquipmentService(session, actor.tenant_id).get(equipment_id)
    return success(EquipmentRead.model_validate(equipment).model_dump())


@router.patch("/equipment/{equipment_id}", summary="Update equipment")
async def update_equipment(equipment_id: uuid.UUID, body: EquipmentUpdate,
                           actor: CurrentUser = Depends(require("equip.manage")),
                           session: AsyncSession = Depends(get_session)) -> dict:
    equipment = await EquipmentService(session, actor.tenant_id).update(
        equipment_id, data=body, actor=actor)
    return success(EquipmentRead.model_validate(equipment).model_dump())


@router.delete("/equipment/{equipment_id}", summary="Delete equipment")
async def delete_equipment(equipment_id: uuid.UUID,
                           actor: CurrentUser = Depends(require("equip.manage")),
                           session: AsyncSession = Depends(get_session)) -> dict:
    await EquipmentService(session, actor.tenant_id).delete(equipment_id, actor=actor)
    return success({"message": "Equipment deleted"})


@router.get("/equipment/{equipment_id}/summary", summary="360° header summary")
async def equipment_summary(equipment_id: uuid.UUID,
                            actor: CurrentUser = Depends(require("equip.read")),
                            session: AsyncSession = Depends(get_session)) -> dict:
    return success(await EquipmentService(session, actor.tenant_id).summary(equipment_id))


@router.get("/equipment/{equipment_id}/history", summary="Unified typed event timeline")
async def equipment_history(equipment_id: uuid.UUID,
                            actor: CurrentUser = Depends(require("equip.read")),
                            session: AsyncSession = Depends(get_session)) -> dict:
    events = await EquipmentService(session, actor.tenant_id).history(equipment_id)
    return success([e.model_dump() for e in events])


@router.get("/equipment/{equipment_id}/metrics", summary="MTBF/MTTR/health metrics")
async def equipment_metrics(equipment_id: uuid.UUID,
                            actor: CurrentUser = Depends(require("equip.read")),
                            session: AsyncSession = Depends(get_session)) -> dict:
    return success(await EquipmentService(session, actor.tenant_id).metrics(equipment_id))
