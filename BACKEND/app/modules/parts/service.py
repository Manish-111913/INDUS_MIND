"""Spare-parts service (docs/08 S12).

Every on_hand change goes through `_apply_movement`, which writes a signed
`part_movements` row and updates the cached balance in one place, so the ledger
and the balance can never drift. Work-order completion consumes planned parts
under `SELECT ... FOR UPDATE` and emits `part.low_stock` when a part crosses its
minimum.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import Event, EventType, bus
from app.core.exceptions import ConflictError, NotFound, ValidationFailed
from app.core.logging import get_logger
from app.modules.audit.service import AuditService
from app.modules.parts.models import Part, PartMovement, WorkOrderPart

log = get_logger("parts")


class PartService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.audit = AuditService(session)

    # ── catalogue ────────────────────────────────────────────────────────────
    async def list(self, *, low_stock: bool = False, is_active: bool | None = None,
                   q: str | None = None) -> list[Part]:
        stmt = select(Part).where(Part.tenant_id == self.tenant_id)
        if low_stock:
            # At or below minimum — matches the ix_parts_low_stock partial index.
            stmt = stmt.where(Part.on_hand <= Part.min_stock)
        if is_active is not None:
            stmt = stmt.where(Part.is_active.is_(is_active))
        if q:
            like = f"%{q.lower()}%"
            stmt = stmt.where((Part.code.ilike(like)) | (Part.name.ilike(like)))
        stmt = stmt.order_by(Part.code)
        return list((await self.session.execute(stmt)).scalars().all())

    async def get(self, part_id: uuid.UUID) -> Part:
        row = (await self.session.execute(
            select(Part).where(Part.id == part_id, Part.tenant_id == self.tenant_id)
        )).scalar_one_or_none()
        if row is None:
            raise NotFound("Part not found", code="PART_NOT_FOUND")
        return row

    async def get_by_code(self, code: str) -> Part | None:
        return (await self.session.execute(
            select(Part).where(Part.tenant_id == self.tenant_id, Part.code == code)
        )).scalar_one_or_none()

    async def create(self, data, actor_id: uuid.UUID) -> Part:
        if await self.get_by_code(data.code):
            raise ConflictError(f"Part code '{data.code}' already exists", code="PART_CODE_TAKEN")
        row = Part(tenant_id=self.tenant_id, created_by=actor_id, updated_by=actor_id,
                   **data.model_dump())
        self.session.add(row)
        await self.session.flush()
        # The opening balance is itself a receipt movement, so the ledger explains
        # the whole of on_hand from row one.
        if Decimal(str(row.on_hand)) != 0:
            self.session.add(PartMovement(
                tenant_id=self.tenant_id, part_id=row.id, delta=row.on_hand,
                reason="receipt", created_by=actor_id, updated_by=actor_id))
        await self.audit.write(action="part.create", entity_type="part", entity_id=row.id,
                               tenant_id=self.tenant_id, actor_id=actor_id,
                               after={"code": row.code, "on_hand": str(row.on_hand)})
        await self.session.flush()
        return row

    async def update(self, part_id: uuid.UUID, data, actor_id: uuid.UUID) -> Part:
        row = await self.get(part_id)
        before = {"min_stock": str(row.min_stock), "is_active": row.is_active}
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(row, field, value)
        row.updated_by = actor_id
        await self.audit.write(action="part.update", entity_type="part", entity_id=row.id,
                               tenant_id=self.tenant_id, actor_id=actor_id, before=before,
                               after={"min_stock": str(row.min_stock), "is_active": row.is_active})
        await self.session.flush()
        return row

    # ── stock movements ──────────────────────────────────────────────────────
    async def _apply_movement(self, part: Part, delta, reason: str, actor_id, *,
                              ref_id: uuid.UUID | None = None) -> bool:
        """Write a movement and update the cached balance. Returns True if this
        movement pushed the part from above its minimum to at/below it — the
        caller uses that edge to decide whether to emit part.low_stock."""
        was_ok = Decimal(str(part.on_hand)) > Decimal(str(part.min_stock))
        new_on_hand = Decimal(str(part.on_hand)) + Decimal(str(delta))
        if new_on_hand < 0:
            raise ValidationFailed(
                f"Insufficient stock for {part.code}: on_hand {part.on_hand}, change {delta}",
                code="PART_INSUFFICIENT_STOCK", http_status=422)
        part.on_hand = new_on_hand
        part.updated_by = actor_id
        self.session.add(PartMovement(
            tenant_id=self.tenant_id, part_id=part.id, delta=delta, reason=reason,
            ref_id=ref_id, created_by=actor_id, updated_by=actor_id))
        await self.session.flush()
        now_low = Decimal(str(part.on_hand)) <= Decimal(str(part.min_stock))
        return was_ok and now_low

    async def adjust(self, part_id: uuid.UUID, delta, reason: str, actor_id) -> Part:
        part = await self._lock(part_id)
        crossed = await self._apply_movement(part, delta, reason, actor_id)
        await self.audit.write(action="part.adjust", entity_type="part", entity_id=part.id,
                               tenant_id=self.tenant_id, actor_id=actor_id,
                               after={"delta": str(delta), "reason": reason,
                                      "on_hand": str(part.on_hand)})
        if crossed:
            await self._emit_low_stock(part, actor_id)
        return part

    async def _lock(self, part_id: uuid.UUID) -> Part:
        """Row-lock a part for a read-modify-write on its balance."""
        row = (await self.session.execute(
            select(Part).where(Part.id == part_id, Part.tenant_id == self.tenant_id)
            .with_for_update()
        )).scalar_one_or_none()
        if row is None:
            raise NotFound("Part not found", code="PART_NOT_FOUND")
        return row

    async def _emit_low_stock(self, part: Part, actor_id) -> None:
        await bus.publish(Event(
            EventType.PART_LOW_STOCK, tenant_id=str(self.tenant_id),
            actor_id=str(actor_id) if actor_id else None,
            payload={"part_id": str(part.id), "part_number": part.code, "part_name": part.name,
                     "on_hand": str(part.on_hand), "min_stock": str(part.min_stock),
                     "uom": part.unit or "ea"}))

    # ── work-order parts ─────────────────────────────────────────────────────
    async def list_wo_parts(self, work_order_id: uuid.UUID) -> list[WorkOrderPart]:
        stmt = (select(WorkOrderPart)
                .where(WorkOrderPart.tenant_id == self.tenant_id,
                       WorkOrderPart.work_order_id == work_order_id)
                .order_by(WorkOrderPart.created_at))
        return list((await self.session.execute(stmt)).scalars().all())

    async def add_wo_part(self, work_order_id: uuid.UUID, data, actor_id) -> WorkOrderPart:
        await self.get(data.part_id)  # validates the part belongs to this tenant
        existing = (await self.session.execute(
            select(WorkOrderPart).where(WorkOrderPart.work_order_id == work_order_id,
                                        WorkOrderPart.part_id == data.part_id))).scalar_one_or_none()
        if existing is not None:
            raise ConflictError("Part already planned on this work order",
                                code="WO_PART_DUPLICATE")
        row = WorkOrderPart(tenant_id=self.tenant_id, work_order_id=work_order_id,
                            part_id=data.part_id, qty_planned=data.qty_planned,
                            created_by=actor_id, updated_by=actor_id)
        self.session.add(row)
        await self.session.flush()
        return row

    async def update_wo_part(self, wo_part_id: uuid.UUID, data, actor_id) -> WorkOrderPart:
        row = await self._get_wo_part(wo_part_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(row, field, value)
        row.updated_by = actor_id
        await self.session.flush()
        return row

    async def delete_wo_part(self, wo_part_id: uuid.UUID) -> None:
        row = await self._get_wo_part(wo_part_id)
        await self.session.delete(row)
        await self.session.flush()

    async def _get_wo_part(self, wo_part_id: uuid.UUID) -> WorkOrderPart:
        row = (await self.session.execute(
            select(WorkOrderPart).where(WorkOrderPart.id == wo_part_id,
                                        WorkOrderPart.tenant_id == self.tenant_id)
        )).scalar_one_or_none()
        if row is None:
            raise NotFound("Work-order part not found", code="WO_PART_NOT_FOUND")
        return row

    async def consume_for_work_order(self, work_order_id: uuid.UUID, actor_id) -> list[uuid.UUID]:
        """Called on WO completion: turn planned parts into consumed stock.

        For each planned part with no explicit qty_used, default used = planned;
        decrement on_hand (locked FOR UPDATE) and write a `wo_consume` movement.
        Runs in the caller's transaction so parts and the WO commit together.
        Returns the ids of parts that crossed below their minimum, so the caller
        can emit low-stock after its own commit.
        """
        crossed_parts: list[uuid.UUID] = []
        for wo_part in await self.list_wo_parts(work_order_id):
            used = wo_part.qty_used if wo_part.qty_used is not None else wo_part.qty_planned
            wo_part.qty_used = used
            if Decimal(str(used)) <= 0:
                continue
            part = await self._lock(wo_part.part_id)
            crossed = await self._apply_movement(part, -Decimal(str(used)), "wo_consume",
                                                 actor_id, ref_id=work_order_id)
            if crossed:
                crossed_parts.append(part.id)
        return crossed_parts

    async def emit_low_stock_for(self, part_ids: list[uuid.UUID], actor_id) -> None:
        for pid in part_ids:
            part = await self.get(pid)
            await self._emit_low_stock(part, actor_id)

    @staticmethod
    def is_low(part: Part) -> bool:
        return Decimal(str(part.on_hand)) <= Decimal(str(part.min_stock))
