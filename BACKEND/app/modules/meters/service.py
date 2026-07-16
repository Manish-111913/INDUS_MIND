"""Meter service (docs/05 S5).

Definitions CRUD (admin), reading capture (technician), and range reads with
server-side downsampling (time-bucket averaging past a point budget so the
condition charts stay light). Also exposes `condition_signals`, the read the
predictor consumes (last-N readings + normal band per meter).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import NamedTuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound, ValidationFailed
from app.modules.audit.service import AuditService
from app.modules.equipment.models import Equipment
from app.modules.meters.models import MeterDefinition, MeterReading
from app.modules.meters.repository import (
    EquipmentMeterRepository,
    MeterDefinitionRepository,
    MeterReadingRepository,
)

DEFAULT_MAX_POINTS = 500


class MeterService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.defs = MeterDefinitionRepository(session, tenant_id)
        self.links = EquipmentMeterRepository(session, tenant_id)
        self.readings = MeterReadingRepository(session, tenant_id)
        self.audit = AuditService(session)

    # ── definitions (admin) ──────────────────────────────────────────────────
    async def list_definitions(self) -> list[MeterDefinition]:
        return await self.defs.list()

    async def create_definition(self, *, data, actor) -> MeterDefinition:
        if await self.defs.by_code(data.code) is not None:
            raise ValidationFailed("Meter code already exists", code="METER_CODE_TAKEN")
        row = await self.defs.add(MeterDefinition(
            code=data.code, name=data.name, unit_id=data.unit_id, unit=data.unit,
            reading_type=data.reading_type, normal_min=data.normal_min, normal_max=data.normal_max,
            created_by=actor.id, updated_by=actor.id))
        await self.audit.write(action="meter.define", entity_type="meter_definition",
                               entity_id=row.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"code": data.code})
        return row

    async def update_definition(self, definition_id: uuid.UUID, *, data, actor) -> MeterDefinition:
        row = await self._definition(definition_id)
        for field in ("name", "unit_id", "unit", "reading_type", "normal_min", "normal_max"):
            val = getattr(data, field)
            if val is not None:
                setattr(row, field, val)
        row.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="meter.update", entity_type="meter_definition",
                               entity_id=row.id, tenant_id=self.tenant_id, actor_id=actor.id)
        return row

    async def delete_definition(self, definition_id: uuid.UUID, *, actor) -> None:
        from sqlalchemy import func

        row = await self._definition(definition_id)
        row.deleted_at = func.now()
        row.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="meter.delete", entity_type="meter_definition",
                               entity_id=row.id, tenant_id=self.tenant_id, actor_id=actor.id)

    async def _definition(self, definition_id: uuid.UUID) -> MeterDefinition:
        row = await self.defs.get(definition_id)
        if row is None:
            raise NotFound("Meter definition not found", code="METER_DEF_NOT_FOUND")
        return row

    # ── readings ─────────────────────────────────────────────────────────────
    async def record_reading(self, equipment_id: uuid.UUID, *, data, actor) -> MeterReading:
        await self._require_equipment(equipment_id)
        definition = await self._resolve_definition(data.meter_definition_id, data.meter_code)
        link = await self.links.get_or_create(equipment_id, definition.id)
        return await self.readings.add(MeterReading(
            equipment_meter_id=link.id, value=Decimal(str(data.value)),
            recorded_at=data.recorded_at or datetime.now(UTC), source=data.source,
            recorded_by=actor.id, created_by=actor.id, updated_by=actor.id))

    async def readings_for(self, equipment_id: uuid.UUID, *, meter_code: str | None,
                           date_from=None, date_to=None,
                           max_points: int = DEFAULT_MAX_POINTS) -> dict:
        await self._require_equipment(equipment_id)
        links = await self.links.list_for_equipment(equipment_id)
        defs = {d.id: d for d in await self.defs.list()}
        series = []
        for link in links:
            definition = defs.get(link.meter_definition_id)
            if definition is None:
                continue
            if meter_code and definition.code != meter_code:
                continue
            raw = await self.readings.range(link.id, date_from, date_to)
            points = _downsample(raw, max_points)
            series.append({
                "meter_code": definition.code, "meter_name": definition.name,
                "unit": definition.unit,
                "normal_min": float(definition.normal_min) if definition.normal_min is not None else None,
                "normal_max": float(definition.normal_max) if definition.normal_max is not None else None,
                "point_count": len(raw), "downsampled": len(points) < len(raw),
                "points": points,
            })
        return {"equipment_id": str(equipment_id), "series": series}

    async def import_readings(self, rows: list[dict], *, actor) -> dict:
        """CSV import (entity=readings). Columns: equipment_tag, meter_code, value, recorded_at."""
        equipment = {e.tag: e for e in (await self.session.execute(select(Equipment).where(
            Equipment.tenant_id == self.tenant_id, Equipment.deleted_at.is_(None)))).scalars()}
        ok, errors = 0, []
        for i, row in enumerate(rows):
            try:
                eq = equipment.get((row.get("equipment_tag") or "").strip())
                if eq is None:
                    raise ValueError(f"unknown equipment_tag '{row.get('equipment_tag')}'")
                definition = await self.defs.by_code((row.get("meter_code") or "").strip())
                if definition is None:
                    raise ValueError(f"unknown meter_code '{row.get('meter_code')}'")
                link = await self.links.get_or_create(eq.id, definition.id)
                recorded_at = _parse_dt(row.get("recorded_at")) or datetime.now(UTC)
                await self.readings.add(MeterReading(
                    equipment_meter_id=link.id, value=Decimal(str(row["value"])),
                    recorded_at=recorded_at, source="import",
                    recorded_by=actor.id, created_by=actor.id, updated_by=actor.id))
                ok += 1
            except Exception as exc:  # noqa: BLE001 — collect a row-level error report
                errors.append({"row": i + 1, "error": str(exc)})
        return {"total_rows": len(rows), "ok_rows": ok, "error_rows": len(errors),
                "errors": errors[:50]}

    async def _resolve_definition(self, definition_id, code) -> MeterDefinition:
        if definition_id is not None:
            return await self._definition(definition_id)
        if code:
            row = await self.defs.by_code(code)
            if row is None:
                raise NotFound(f"Meter code '{code}' not found", code="METER_DEF_NOT_FOUND")
            return row
        raise ValidationFailed("Provide meter_definition_id or meter_code",
                               code="METER_REF_REQUIRED")

    async def _require_equipment(self, equipment_id: uuid.UUID) -> Equipment:
        eq = (await self.session.execute(select(Equipment).where(
            Equipment.id == equipment_id, Equipment.tenant_id == self.tenant_id,
            Equipment.deleted_at.is_(None)))).scalar_one_or_none()
        if eq is None:
            raise NotFound("Equipment not found", code="EQUIPMENT_NOT_FOUND")
        return eq


class _Point(NamedTuple):
    t: datetime
    v: float


def _downsample(readings: list[MeterReading], max_points: int) -> list[dict]:
    """Time-bucket averaging: ≤max_points → raw; else average within N even time buckets."""
    pts = [_Point(r.recorded_at, float(r.value)) for r in readings]
    if len(pts) <= max_points or max_points <= 0:
        return [{"recorded_at": p.t.isoformat(), "value": round(p.v, 4)} for p in pts]
    t0 = pts[0].t.timestamp()
    span = pts[-1].t.timestamp() - t0 or 1.0
    buckets: dict[int, list[float]] = {}
    order: list[int] = []
    for p in pts:
        idx = min(max_points - 1, int((p.t.timestamp() - t0) / span * max_points))
        if idx not in buckets:
            buckets[idx] = []
            order.append(idx)
        buckets[idx].append(p.v)
    out = []
    for idx in sorted(order):
        vals = buckets[idx]
        bucket_ts = t0 + (idx + 0.5) * span / max_points
        out.append({"recorded_at": datetime.fromtimestamp(bucket_ts, UTC).isoformat(),
                    "value": round(sum(vals) / len(vals), 4)})
    return out


def _parse_dt(value) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    except (ValueError, TypeError):
        return None
