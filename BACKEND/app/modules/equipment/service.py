"""Asset services (docs/02 §7, §23, §31).

No business logic in routers. Lookup-backed fields (type/criticality/status) are
validated against the lookups service — nothing hardcoded. Every mutation writes
an audit row and publishes a typed event; the tree is cached in Redis (10 min)
and invalidated by those events (see events.py).
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, date, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams, PageResult
from app.core.events import Event, EventType, bus
from app.core.exceptions import ConflictError, NotFound, ValidationFailed, VersionMismatch
from app.core.redis import get_redis
from app.modules.audit.service import AuditService
from app.modules.equipment.models import Area, Equipment, Plant
from app.modules.equipment.providers import history_registry, metrics_registry
from app.modules.equipment.repository import (
    AreaRepository,
    EquipmentRepository,
    PlantRepository,
)
from app.modules.equipment.schemas import ImportReport, ImportRowResult, TimelineEvent
from app.modules.lookups.service import LookupService

TREE_TTL = 600  # 10 minutes (docs/02 §31)


def tree_cache_key(tenant_id: uuid.UUID | str, plant_id: uuid.UUID | str) -> str:
    return f"tenant:{tenant_id}:equip:tree:{plant_id}"


class PlantService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = PlantRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def list(self, params: PageParams) -> PageResult:
        return await self.repo.list(params)

    async def get(self, plant_id: uuid.UUID) -> Plant:
        plant = await self.repo.get(plant_id)
        if plant is None:
            raise NotFound("Plant not found", code="PLANT_NOT_FOUND")
        return plant

    async def create(self, *, name: str, code: str, location: str | None,
                     timezone: str, actor) -> Plant:
        if await self.repo.get_by_code(code) is not None:
            raise ConflictError("Plant code already exists", code="PLANT_CODE_TAKEN")
        plant = await self.repo.add(Plant(name=name, code=code, location=location,
                                          timezone=timezone, created_by=actor.id, updated_by=actor.id))
        await self.audit.write(action="plant.create", entity_type="plant", entity_id=plant.id,
                               tenant_id=self.tenant_id, actor_id=actor.id, after={"code": code})
        return plant

    async def update(self, plant_id: uuid.UUID, *, data, actor) -> Plant:
        plant = await self.get(plant_id)
        _check_version(plant, data.version)
        if data.name is not None:
            plant.name = data.name
        if data.location is not None:
            plant.location = data.location
        if data.timezone is not None:
            plant.timezone = data.timezone
        plant.version += 1
        plant.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="plant.update", entity_type="plant", entity_id=plant.id,
                               tenant_id=self.tenant_id, actor_id=actor.id)
        return plant

    async def delete(self, plant_id: uuid.UUID, *, actor) -> None:
        from sqlalchemy import func

        plant = await self.get(plant_id)
        plant.deleted_at = func.now()
        plant.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="plant.delete", entity_type="plant", entity_id=plant.id,
                               tenant_id=self.tenant_id, actor_id=actor.id)
        await bus.publish(Event(EventType.EQUIPMENT_UPDATED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id), payload={"plant_id": str(plant_id)}))


class AreaService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = AreaRepository(session, tenant_id)
        self.plants = PlantRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def list(self, params: PageParams, *, plant_id: uuid.UUID | None) -> PageResult:
        return await self.repo.list(params, plant_id=plant_id)

    async def get(self, area_id: uuid.UUID) -> Area:
        area = await self.repo.get(area_id)
        if area is None:
            raise NotFound("Area not found", code="AREA_NOT_FOUND")
        return area

    async def create(self, *, plant_id: uuid.UUID, name: str, code: str, actor) -> Area:
        if await self.plants.get(plant_id) is None:
            raise ValidationFailed("Unknown plant_id", code="VALIDATION_ERROR",
                                   http_status=422, field_errors={"plant_id": "Plant not found"})
        if await self.repo.get_by_code(plant_id, code) is not None:
            raise ConflictError("Area code already exists in plant", code="AREA_CODE_TAKEN")
        area = await self.repo.add(Area(plant_id=plant_id, name=name, code=code,
                                        created_by=actor.id, updated_by=actor.id))
        await self.audit.write(action="area.create", entity_type="area", entity_id=area.id,
                               tenant_id=self.tenant_id, actor_id=actor.id, after={"code": code})
        await bus.publish(Event(EventType.EQUIPMENT_UPDATED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id), payload={"plant_id": str(plant_id)}))
        return area

    async def update(self, area_id: uuid.UUID, *, data, actor) -> Area:
        area = await self.get(area_id)
        _check_version(area, data.version)
        if data.name is not None:
            area.name = data.name
        area.version += 1
        area.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="area.update", entity_type="area", entity_id=area.id,
                               tenant_id=self.tenant_id, actor_id=actor.id)
        await bus.publish(Event(EventType.EQUIPMENT_UPDATED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id), payload={"plant_id": str(area.plant_id)}))
        return area

    async def delete(self, area_id: uuid.UUID, *, actor) -> None:
        from sqlalchemy import func

        area = await self.get(area_id)
        area.deleted_at = func.now()
        area.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="area.delete", entity_type="area", entity_id=area.id,
                               tenant_id=self.tenant_id, actor_id=actor.id)
        await bus.publish(Event(EventType.EQUIPMENT_UPDATED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id), payload={"plant_id": str(area.plant_id)}))


class EquipmentService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = EquipmentRepository(session, tenant_id)
        self.plants = PlantRepository(session, tenant_id)
        self.areas = AreaRepository(session, tenant_id)
        self.lookups = LookupService(session, tenant_id)
        self.audit = AuditService(session)

    # ── validation against lookups (nothing hardcoded) ───────────────────────
    async def _lookup_codes(self, category: str) -> set[str]:
        return {row.code for row in await self.lookups.by_category(category)}

    async def _lookup_ids(self, category: str) -> set[uuid.UUID]:
        return {row.id for row in await self.lookups.by_category(category)}

    async def _validate_refs(self, *, plant_id, area_id, parent_id, type_id,
                             criticality, status) -> None:
        field_errors: dict[str, str] = {}
        if plant_id is not None and await self.plants.get(plant_id) is None:
            field_errors["plant_id"] = "Plant not found"
        if area_id is not None and await self.areas.get(area_id) is None:
            field_errors["area_id"] = "Area not found"
        if parent_id is not None and await self.repo.get(parent_id) is None:
            field_errors["parent_id"] = "Parent equipment not found"
        if type_id is not None and type_id not in await self._lookup_ids("equipment_types"):
            field_errors["type_id"] = "Unknown equipment type"
        if criticality is not None and criticality not in await self._lookup_codes("criticality"):
            field_errors["criticality"] = "Unknown criticality"
        if status is not None and status not in await self._lookup_codes("equipment_status"):
            field_errors["status"] = "Unknown status"
        if field_errors:
            raise ValidationFailed("Invalid references", code="VALIDATION_ERROR",
                                   http_status=422, field_errors=field_errors)

    async def list(self, params: PageParams, **filters) -> PageResult:
        return await self.repo.list(params, **filters)

    async def get(self, equipment_id: uuid.UUID) -> Equipment:
        equipment = await self.repo.get(equipment_id)
        if equipment is None:
            raise NotFound("Equipment not found", code="EQUIPMENT_NOT_FOUND")
        return equipment

    async def create(self, *, data, actor) -> Equipment:
        if await self.repo.get_by_tag(data.tag) is not None:
            raise ConflictError("Equipment tag already exists", code="EQUIPMENT_TAG_TAKEN")
        await self._validate_refs(
            plant_id=data.plant_id, area_id=data.area_id, parent_id=data.parent_id,
            type_id=data.type_id, criticality=data.criticality, status=data.status)
        equipment = await self.repo.add(Equipment(
            plant_id=data.plant_id, area_id=data.area_id, parent_id=data.parent_id,
            tag=data.tag, name=data.name, type_id=data.type_id, criticality=data.criticality,
            status=data.status, manufacturer=data.manufacturer, model=data.model,
            serial_no=data.serial_no, install_date=data.install_date, specs=data.specs,
            health_score=data.health_score, created_by=actor.id, updated_by=actor.id))
        await self.audit.write(action="equipment.create", entity_type="equipment",
                               entity_id=equipment.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"tag": data.tag, "name": data.name})
        await bus.publish(Event(EventType.EQUIPMENT_CREATED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id),
                                payload={"equipment_id": str(equipment.id),
                                         "plant_id": str(equipment.plant_id), "tag": equipment.tag}))
        return equipment

    async def update(self, equipment_id: uuid.UUID, *, data, actor) -> Equipment:
        equipment = await self.get(equipment_id)
        _check_version(equipment, data.version)
        await self._validate_refs(
            plant_id=None, area_id=data.area_id, parent_id=data.parent_id,
            type_id=data.type_id, criticality=data.criticality, status=data.status)
        before = {"status": equipment.status, "criticality": equipment.criticality}
        for field in ("area_id", "parent_id", "name", "type_id", "criticality", "status",
                      "manufacturer", "model", "serial_no", "install_date", "specs"):
            value = getattr(data, field)
            if value is not None:
                setattr(equipment, field, value)
        if data.health_score is not None:
            equipment.health_score = data.health_score
            equipment.health_updated_at = datetime.now(UTC)  # real value (serialized in response)
        equipment.version += 1
        equipment.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="equipment.update", entity_type="equipment",
                               entity_id=equipment.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               before=before, after={"status": equipment.status})
        await bus.publish(Event(EventType.EQUIPMENT_UPDATED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id),
                                payload={"equipment_id": str(equipment.id),
                                         "plant_id": str(equipment.plant_id)}))
        return equipment

    async def delete(self, equipment_id: uuid.UUID, *, actor) -> None:
        from sqlalchemy import func

        equipment = await self.get(equipment_id)
        equipment.deleted_at = func.now()
        equipment.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="equipment.delete", entity_type="equipment",
                               entity_id=equipment.id, tenant_id=self.tenant_id, actor_id=actor.id)
        await bus.publish(Event(EventType.EQUIPMENT_DELETED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id),
                                payload={"equipment_id": str(equipment.id),
                                         "plant_id": str(equipment.plant_id)}))

    # ── tree (recursive CTE + Redis cache) ───────────────────────────────────
    async def tree(self, plant_id: uuid.UUID) -> dict:
        if await self.plants.get(plant_id) is None:
            raise NotFound("Plant not found", code="PLANT_NOT_FOUND")
        redis = get_redis()
        key = tree_cache_key(self.tenant_id, plant_id)
        cached = await redis.get(key)
        if cached:
            return json.loads(cached)

        rows = await self.repo.tree_rows(plant_id)
        areas = await self.areas.list_for_plant(plant_id)
        tree = _build_tree(str(plant_id), rows, areas)
        await redis.set(key, json.dumps(tree, default=str), ex=TREE_TTL)
        return tree

    # ── 360° views ───────────────────────────────────────────────────────────
    async def summary(self, equipment_id: uuid.UUID) -> dict:
        equipment = await self.get(equipment_id)
        type_labels = {row.id: row.label for row in await self.lookups.by_category("equipment_types")}
        crit_labels = {row.code: row.label for row in await self.lookups.by_category("criticality")}
        plant = await self.plants.get(equipment.plant_id)
        area = await self.areas.get(equipment.area_id) if equipment.area_id else None
        return {
            "id": str(equipment.id),
            "tag": equipment.tag,
            "name": equipment.name,
            "type": type_labels.get(equipment.type_id),
            "criticality": equipment.criticality,
            "criticality_label": crit_labels.get(equipment.criticality),
            "status": equipment.status,
            "health_score": float(equipment.health_score) if equipment.health_score is not None else None,
            "health_updated_at": equipment.health_updated_at,
            "manufacturer": equipment.manufacturer,
            "model": equipment.model,
            "serial_no": equipment.serial_no,
            "install_date": equipment.install_date,
            "plant": {"id": str(plant.id), "name": plant.name, "code": plant.code} if plant else None,
            "area": {"id": str(area.id), "name": area.name, "code": area.code} if area else None,
            "specs": equipment.specs,
        }

    async def history(self, equipment_id: uuid.UUID) -> list[TimelineEvent]:
        await self.get(equipment_id)  # 404 if missing / not in tenant
        return await history_registry.collect(self.session, self.tenant_id, equipment_id)

    async def metrics(self, equipment_id: uuid.UUID) -> dict:
        equipment = await self.get(equipment_id)
        base = {
            "health_score": float(equipment.health_score) if equipment.health_score is not None else None,
            "health_updated_at": equipment.health_updated_at,
            # Placeholders until the maintenance module registers its provider.
            "mtbf_hours": None,
            "mttr_hours": None,
            "pm_compliance": None,
            "open_work_orders": None,
            "backlog_hours": None,
        }
        base.update(await metrics_registry.collect(self.session, self.tenant_id, equipment_id))
        return base

    async def resolve(self, tag: str) -> list[dict]:
        return await self.repo.resolve(tag)

    # ── bulk CSV import (row-level report) ───────────────────────────────────
    async def bulk_import(self, rows: list[dict], *, actor) -> ImportReport:
        results: list[ImportRowResult] = []
        plant_by_code: dict[str, Plant] = {}
        created = 0
        crit_codes = await self._lookup_codes("criticality")
        status_codes = await self._lookup_codes("equipment_status")
        type_by_code = {row.code: row.id for row in await self.lookups.by_category("equipment_types")}

        for idx, raw in enumerate(rows, start=1):
            errors: list[str] = []
            tag = (raw.get("tag") or "").strip()
            name = (raw.get("name") or "").strip()
            plant_code = (raw.get("plant_code") or "").strip()
            if not tag:
                errors.append("tag is required")
            if not name:
                errors.append("name is required")
            if not plant_code:
                errors.append("plant_code is required")

            plant = None
            if plant_code:
                if plant_code not in plant_by_code:
                    found = await self.plants.get_by_code(plant_code)
                    if found:
                        plant_by_code[plant_code] = found
                plant = plant_by_code.get(plant_code)
                if plant is None:
                    errors.append(f"unknown plant_code '{plant_code}'")

            area = None
            area_code = (raw.get("area_code") or "").strip()
            if area_code and plant is not None:
                area = await self.areas.get_by_code(plant.id, area_code)
                if area is None:
                    errors.append(f"unknown area_code '{area_code}'")

            criticality = (raw.get("criticality") or "C").strip() or "C"
            if criticality not in crit_codes:
                errors.append(f"unknown criticality '{criticality}'")
            status = (raw.get("status") or "operational").strip() or "operational"
            if status not in status_codes:
                errors.append(f"unknown status '{status}'")

            type_id = None
            type_code = (raw.get("type") or "").strip()
            if type_code:
                type_id = type_by_code.get(type_code)
                if type_id is None:
                    errors.append(f"unknown type '{type_code}'")

            specs: dict = {}
            if raw.get("specs"):
                try:
                    specs = json.loads(raw["specs"])
                except (ValueError, TypeError):
                    errors.append("specs must be valid JSON")

            if tag and not errors and await self.repo.get_by_tag(tag) is not None:
                errors.append(f"tag '{tag}' already exists")

            if errors:
                results.append(ImportRowResult(row=idx, status="error", tag=tag or None, errors=errors))
                continue

            install = _parse_date(raw.get("install_date"))
            equipment = await self.repo.add(Equipment(
                plant_id=plant.id, area_id=area.id if area else None, tag=tag, name=name,
                type_id=type_id, criticality=criticality, status=status,
                manufacturer=(raw.get("manufacturer") or None), model=(raw.get("model") or None),
                serial_no=(raw.get("serial_no") or None), install_date=install, specs=specs,
                created_by=actor.id, updated_by=actor.id))
            created += 1
            results.append(ImportRowResult(row=idx, status="created", id=equipment.id, tag=tag))
            await self.audit.write(action="equipment.import", entity_type="equipment",
                                   entity_id=equipment.id, tenant_id=self.tenant_id,
                                   actor_id=actor.id, after={"tag": tag})

        if created:
            await bus.publish(Event(EventType.EQUIPMENT_CREATED, tenant_id=str(self.tenant_id),
                                    actor_id=str(actor.id), payload={"imported": created}))
        return ImportReport(total=len(rows), created=created, failed=len(rows) - created, rows=results)


# ── helpers ──────────────────────────────────────────────────────────────────
def _node(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "tag": row["tag"],
        "name": row["name"],
        "type_id": str(row["type_id"]) if row["type_id"] else None,
        "criticality": row["criticality"],
        "status": row["status"],
        "health_score": float(row["health_score"]) if row["health_score"] is not None else None,
        "children": [],
    }


def _build_tree(plant_id: str, rows: list[dict], areas: list[Area]) -> dict:
    nodes = {str(r["id"]): _node(r) for r in rows}
    roots: list[dict] = []
    for r in rows:
        node = nodes[str(r["id"])]
        parent_id = str(r["parent_id"]) if r["parent_id"] else None
        if parent_id and parent_id in nodes:
            nodes[parent_id]["children"].append(node)
        else:
            roots.append((str(r["area_id"]) if r["area_id"] else None, node))

    by_area: dict[str | None, list[dict]] = {}
    for area_id, node in roots:
        by_area.setdefault(area_id, []).append(node)

    area_blocks = [
        {"id": str(a.id), "name": a.name, "code": a.code, "equipment": by_area.get(str(a.id), [])}
        for a in areas
    ]
    return {
        "plant_id": plant_id,
        "areas": area_blocks,
        "unassigned": by_area.get(None, []),
    }


def _parse_date(value) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value).strip())
    except ValueError:
        return None


def _check_version(entity, expected: int | None) -> None:
    if expected is not None and getattr(entity, "version", None) != expected:
        raise VersionMismatch()
