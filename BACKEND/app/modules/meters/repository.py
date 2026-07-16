"""Meter repositories (docs/05 S5)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.meters.models import EquipmentMeter, MeterDefinition, MeterReading


class MeterDefinitionRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        # Normalise once: the columns are real UUIDs (cf. BaseRepository).
        self.tenant_id = tenant_id if isinstance(tenant_id, uuid.UUID) else uuid.UUID(str(tenant_id))

    async def list(self) -> list[MeterDefinition]:
        return list((await self.session.execute(select(MeterDefinition).where(
            MeterDefinition.tenant_id == self.tenant_id,
            MeterDefinition.deleted_at.is_(None)).order_by(MeterDefinition.code))).scalars().all())

    async def get(self, definition_id: uuid.UUID) -> MeterDefinition | None:
        return (await self.session.execute(select(MeterDefinition).where(
            MeterDefinition.id == definition_id, MeterDefinition.tenant_id == self.tenant_id,
            MeterDefinition.deleted_at.is_(None)))).scalar_one_or_none()

    async def by_code(self, code: str) -> MeterDefinition | None:
        return (await self.session.execute(select(MeterDefinition).where(
            MeterDefinition.tenant_id == self.tenant_id, MeterDefinition.code == code,
            MeterDefinition.deleted_at.is_(None)))).scalar_one_or_none()

    async def add(self, row: MeterDefinition) -> MeterDefinition:
        row.tenant_id = self.tenant_id
        self.session.add(row)
        await self.session.flush()
        return row


class EquipmentMeterRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        # Normalise once: the columns are real UUIDs (cf. BaseRepository).
        self.tenant_id = tenant_id if isinstance(tenant_id, uuid.UUID) else uuid.UUID(str(tenant_id))

    async def list_for_equipment(self, equipment_id: uuid.UUID) -> list[EquipmentMeter]:
        return list((await self.session.execute(select(EquipmentMeter).where(
            EquipmentMeter.tenant_id == self.tenant_id,
            EquipmentMeter.equipment_id == equipment_id))).scalars().all())

    async def get(self, equipment_id: uuid.UUID, definition_id: uuid.UUID) -> EquipmentMeter | None:
        return (await self.session.execute(select(EquipmentMeter).where(
            EquipmentMeter.tenant_id == self.tenant_id,
            EquipmentMeter.equipment_id == equipment_id,
            EquipmentMeter.meter_definition_id == definition_id))).scalar_one_or_none()

    async def get_or_create(self, equipment_id: uuid.UUID, definition_id: uuid.UUID) -> EquipmentMeter:
        row = await self.get(equipment_id, definition_id)
        if row is None:
            row = EquipmentMeter(tenant_id=self.tenant_id, equipment_id=equipment_id,
                                 meter_definition_id=definition_id)
            self.session.add(row)
            await self.session.flush()
        return row


class MeterReadingRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        # Normalise once: the columns are real UUIDs (cf. BaseRepository).
        self.tenant_id = tenant_id if isinstance(tenant_id, uuid.UUID) else uuid.UUID(str(tenant_id))

    async def add(self, row: MeterReading) -> MeterReading:
        row.tenant_id = self.tenant_id
        self.session.add(row)
        await self.session.flush()
        return row

    async def last_n(self, equipment_meter_id: uuid.UUID, n: int) -> list[MeterReading]:
        rows = list((await self.session.execute(select(MeterReading).where(
            MeterReading.tenant_id == self.tenant_id,
            MeterReading.equipment_meter_id == equipment_meter_id)
            .order_by(MeterReading.recorded_at.desc()).limit(n))).scalars().all())
        return list(reversed(rows))  # chronological ascending

    async def range(self, equipment_meter_id: uuid.UUID, date_from=None,
                    date_to=None) -> list[MeterReading]:
        stmt = select(MeterReading).where(
            MeterReading.tenant_id == self.tenant_id,
            MeterReading.equipment_meter_id == equipment_meter_id)
        if date_from is not None:
            stmt = stmt.where(MeterReading.recorded_at >= date_from)
        if date_to is not None:
            stmt = stmt.where(MeterReading.recorded_at <= date_to)
        return list((await self.session.execute(
            stmt.order_by(MeterReading.recorded_at))).scalars().all())
