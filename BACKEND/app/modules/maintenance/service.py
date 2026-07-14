"""Maintenance services (docs/02 §7, §18, §31, §34).

No business logic in routers. Lookup-backed fields (type/priority/failure codes/
modes) validate against the lookups service — nothing hardcoded. Every mutation
writes an audit row and publishes a typed event. Work-order transitions go
through the central state machine; closing a WO with a failure creates and links
a `failure_record` and emits `workorder.closed` + `failure.recorded`, which the
graph projector and (future) notifications subscribe to.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams, PageResult
from app.core.events import Event, EventType, bus
from app.core.exceptions import NotFound, ValidationFailed, VersionMismatch
from app.core.logging import get_logger
from app.modules.audit.service import AuditService
from app.modules.equipment.repository import EquipmentRepository
from app.modules.lookups.service import LookupService
from app.modules.maintenance import state_machine as sm
from app.modules.maintenance.models import (
    FailureRecord,
    MaintenanceSchedule,
    WorkOrder,
)
from app.modules.maintenance.repository import (
    FailureRepository,
    MetricsRepository,
    ProposalRepository,
    ScheduleRepository,
    WorkOrderRepository,
)

log = get_logger("maintenance.service")


def _check_version(entity, expected: int | None) -> None:
    if expected is not None and getattr(entity, "version", None) != expected:
        raise VersionMismatch()


class _LookupMixin:
    session: AsyncSession
    tenant_id: uuid.UUID | str

    async def _codes(self, category: str) -> set[str]:
        return {row.code for row in await LookupService(self.session, self.tenant_id).by_category(category)}

    async def _ids(self, category: str) -> set[uuid.UUID]:
        return {row.id for row in await LookupService(self.session, self.tenant_id).by_category(category)}


class WorkOrderService(_LookupMixin):
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = WorkOrderRepository(session, tenant_id)
        self.failures = FailureRepository(session, tenant_id)
        self.equipment = EquipmentRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def list(self, params: PageParams, **filters) -> PageResult:
        return await self.repo.list(params, **filters)

    async def get(self, wo_id: uuid.UUID) -> WorkOrder:
        wo = await self.repo.get(wo_id)
        if wo is None:
            raise NotFound("Work order not found", code="WO_NOT_FOUND")
        return wo

    async def _validate_refs(self, *, equipment_id, type_, priority, assignee_id) -> None:
        field_errors: dict[str, str] = {}
        if equipment_id is not None and await self.equipment.get(equipment_id) is None:
            field_errors["equipment_id"] = "Equipment not found"
        if type_ is not None and type_ not in await self._codes("wo_types"):
            field_errors["type"] = "Unknown work-order type"
        if priority is not None and priority not in await self._codes("priorities"):
            field_errors["priority"] = "Unknown priority"
        if assignee_id is not None:
            from app.modules.auth.repository import UserRepository

            user = await UserRepository(self.session).get(assignee_id)
            if user is None or user.tenant_id != _uuid(self.tenant_id):
                field_errors["assignee_id"] = "Assignee not found"
        if field_errors:
            raise ValidationFailed("Invalid references", code="VALIDATION_ERROR",
                                   http_status=422, field_errors=field_errors)

    async def create(self, *, data, actor, source: str = "manual",
                     schedule_id: uuid.UUID | None = None) -> WorkOrder:
        await self._validate_refs(equipment_id=data.equipment_id, type_=data.type,
                                  priority=data.priority, assignee_id=data.assignee_id)
        wo = await self.repo.add(WorkOrder(
            wo_number=await self.repo.next_number(), title=data.title,
            description=data.description, equipment_id=data.equipment_id, type=data.type,
            priority=data.priority, status=sm.OPEN, assignee_id=data.assignee_id,
            requested_by=actor.id, due_at=data.due_at, checklist=data.checklist,
            parts=data.parts, source=source, schedule_id=schedule_id,
            created_by=actor.id, updated_by=actor.id))
        await self.audit.write(action="workorder.create", entity_type="work_order",
                               entity_id=wo.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"wo_number": wo.wo_number, "status": wo.status,
                                      "source": source})
        await bus.publish(Event(EventType.WORKORDER_CREATED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id),
                                payload={"work_order_id": str(wo.id), "wo_number": wo.wo_number,
                                         "equipment_id": str(wo.equipment_id) if wo.equipment_id else None}))
        return wo

    async def update(self, wo_id: uuid.UUID, *, data, actor) -> WorkOrder:
        wo = await self.get(wo_id)
        _check_version(wo, data.version)
        if wo.status in sm.TERMINAL_STATES:
            raise ValidationFailed("Cannot edit a closed/cancelled work order",
                                   code="WO_TERMINAL", http_status=422)
        await self._validate_refs(equipment_id=data.equipment_id, type_=data.type,
                                  priority=data.priority, assignee_id=None)
        for field in ("title", "description", "equipment_id", "type", "priority",
                      "due_at", "checklist", "parts"):
            value = getattr(data, field)
            if value is not None:
                setattr(wo, field, value)
        wo.version += 1
        wo.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="workorder.update", entity_type="work_order",
                               entity_id=wo.id, tenant_id=self.tenant_id, actor_id=actor.id)
        return wo

    async def delete(self, wo_id: uuid.UUID, *, actor) -> None:
        from sqlalchemy import func

        wo = await self.get(wo_id)
        wo.deleted_at = func.now()
        wo.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="workorder.delete", entity_type="work_order",
                               entity_id=wo.id, tenant_id=self.tenant_id, actor_id=actor.id)

    async def assign(self, wo_id: uuid.UUID, *, assignee_id: uuid.UUID, version, actor) -> WorkOrder:
        wo = await self.get(wo_id)
        _check_version(wo, version)
        if wo.status in sm.TERMINAL_STATES:
            raise ValidationFailed("Cannot assign a closed/cancelled work order",
                                   code="WO_TERMINAL", http_status=422)
        await self._validate_refs(equipment_id=None, type_=None, priority=None,
                                  assignee_id=assignee_id)
        before = str(wo.assignee_id) if wo.assignee_id else None
        wo.assignee_id = assignee_id
        wo.version += 1
        wo.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="workorder.assign", entity_type="work_order",
                               entity_id=wo.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               before={"assignee_id": before},
                               after={"assignee_id": str(assignee_id)})
        await bus.publish(Event(EventType.WORKORDER_ASSIGNED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id),
                                payload={"work_order_id": str(wo.id), "wo_number": wo.wo_number,
                                         "assignee_id": str(assignee_id),
                                         "entity_type": "work_order", "entity_id": str(wo.id)}))
        return wo

    async def transition(self, wo_id: uuid.UUID, *, target: str, note: str | None,
                         version, actor) -> WorkOrder:
        wo = await self.get(wo_id)
        _check_version(wo, version)
        if target == sm.CLOSED:
            raise ValidationFailed("Use the /close endpoint to close a work order",
                                   code="USE_CLOSE_ENDPOINT", http_status=422)
        sm.validate_transition(wo.status, target)
        before = wo.status
        wo.status = target
        if target == sm.IN_PROGRESS and wo.started_at is None:
            wo.started_at = datetime.now(UTC)
        wo.version += 1
        wo.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="workorder.transition", entity_type="work_order",
                               entity_id=wo.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               before={"status": before}, after={"status": target, "note": note})
        await bus.publish(Event(EventType.WORKORDER_TRANSITIONED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id),
                                payload={"work_order_id": str(wo.id), "from": before, "to": target}))
        return wo

    async def close(self, wo_id: uuid.UUID, *, data, actor) -> WorkOrder:
        wo = await self.get(wo_id)
        _check_version(wo, data.version)
        sm.validate_transition(wo.status, sm.CLOSED)

        # validate failure lookups if supplied
        field_errors: dict[str, str] = {}
        if data.failure_code_id is not None and data.failure_code_id not in await self._ids("failure_codes"):
            field_errors["failure_code_id"] = "Unknown failure code"
        if data.failure_mode_id is not None and data.failure_mode_id not in await self._ids("failure_modes"):
            field_errors["failure_mode_id"] = "Unknown failure mode"
        if field_errors:
            raise ValidationFailed("Invalid references", code="VALIDATION_ERROR",
                                   http_status=422, field_errors=field_errors)

        now = datetime.now(UTC)
        failure: FailureRecord | None = None
        # A failure code implies a corrective outcome → create/link a failure_record.
        if data.failure_code_id is not None or data.failure_mode_id is not None:
            failure = await self.failures.add(FailureRecord(
                equipment_id=wo.equipment_id, work_order_id=wo.id,
                failure_mode_id=data.failure_mode_id, failure_code_id=data.failure_code_id,
                severity=wo.priority, occurred_at=wo.started_at or wo.created_at,
                detected_by="work_order", downtime_minutes=data.downtime_minutes,
                description=data.closure_notes, rca_status="none",
                created_by=actor.id, updated_by=actor.id))
            wo.failure_id = failure.id

        wo.status = sm.CLOSED
        wo.closed_at = now
        wo.closure_notes = data.closure_notes
        wo.failure_code_id = data.failure_code_id
        wo.labor_hours = data.labor_hours
        if data.parts:
            wo.parts = [p.model_dump() for p in data.parts]
        wo.sla_breach = bool(wo.due_at and now > wo.due_at)
        wo.version += 1
        wo.updated_by = actor.id
        await self.session.flush()

        await self.audit.write(action="workorder.close", entity_type="work_order",
                               entity_id=wo.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"status": "closed", "failure_id": str(wo.failure_id)
                                      if wo.failure_id else None, "sla_breach": wo.sla_breach})
        await bus.publish(Event(EventType.WORKORDER_CLOSED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id),
                                payload={"work_order_id": str(wo.id), "wo_number": wo.wo_number,
                                         "equipment_id": str(wo.equipment_id) if wo.equipment_id else None,
                                         "failure_id": str(wo.failure_id) if wo.failure_id else None}))
        if failure is not None:
            await self.audit.write(action="failure.record", entity_type="failure_record",
                                   entity_id=failure.id, tenant_id=self.tenant_id, actor_id=actor.id,
                                   after={"work_order_id": str(wo.id)})
            await bus.publish(Event(EventType.FAILURE_RECORDED, tenant_id=str(self.tenant_id),
                                    actor_id=str(actor.id),
                                    payload={"failure_id": str(failure.id),
                                             "equipment_id": str(failure.equipment_id)
                                             if failure.equipment_id else None,
                                             "failure_mode_id": str(failure.failure_mode_id)
                                             if failure.failure_mode_id else None,
                                             "work_order_id": str(wo.id)}))
        return wo


class ScheduleService(_LookupMixin):
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = ScheduleRepository(session, tenant_id)
        self.equipment = EquipmentRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def list(self, params: PageParams, **filters) -> PageResult:
        return await self.repo.list(params, **filters)

    async def get(self, schedule_id: uuid.UUID) -> MaintenanceSchedule:
        schedule = await self.repo.get(schedule_id)
        if schedule is None:
            raise NotFound("Schedule not found", code="SCHEDULE_NOT_FOUND")
        return schedule

    async def create(self, *, data, actor) -> MaintenanceSchedule:
        if data.equipment_id is not None and await self.equipment.get(data.equipment_id) is None:
            raise ValidationFailed("Unknown equipment_id", code="VALIDATION_ERROR", http_status=422,
                                   field_errors={"equipment_id": "Equipment not found"})
        schedule = await self.repo.add(MaintenanceSchedule(
            equipment_id=data.equipment_id, name=data.name, frequency_type=data.frequency_type,
            interval_days=data.interval_days, next_due_at=data.next_due_at,
            task_template=data.task_template, active=data.active,
            created_by=actor.id, updated_by=actor.id))
        await self.audit.write(action="schedule.create", entity_type="maintenance_schedule",
                               entity_id=schedule.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"name": schedule.name})
        return schedule

    async def update(self, schedule_id: uuid.UUID, *, data, actor) -> MaintenanceSchedule:
        schedule = await self.get(schedule_id)
        _check_version(schedule, data.version)
        for field in ("name", "frequency_type", "interval_days", "next_due_at",
                      "task_template", "active"):
            value = getattr(data, field)
            if value is not None:
                setattr(schedule, field, value)
        schedule.version += 1
        schedule.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="schedule.update", entity_type="maintenance_schedule",
                               entity_id=schedule.id, tenant_id=self.tenant_id, actor_id=actor.id)
        return schedule

    async def delete(self, schedule_id: uuid.UUID, *, actor) -> None:
        from sqlalchemy import func

        schedule = await self.get(schedule_id)
        schedule.deleted_at = func.now()
        schedule.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="schedule.delete", entity_type="maintenance_schedule",
                               entity_id=schedule.id, tenant_id=self.tenant_id, actor_id=actor.id)

    async def generate_due(self, *, actor_id: uuid.UUID | str | None = None,
                           now: datetime | None = None) -> list[WorkOrder]:
        """Hourly beat body: due schedules → auto-create WOs (source=schedule) +
        a notification event. Advances `next_due_at` by `interval_days` and stamps
        `last_generated_at` so the same schedule doesn't fire twice per window."""
        now = now or datetime.now(UTC)
        actor_id = actor_id or uuid.UUID(int=0)
        created: list[WorkOrder] = []
        for schedule in await self.repo.due(now=now):
            template = schedule.task_template or {}
            wo = WorkOrder(
                tenant_id=self.tenant_id,
                wo_number=await WorkOrderRepository(self.session, self.tenant_id).next_number(),
                title=template.get("title") or f"PM: {schedule.name}",
                description=template.get("description"),
                equipment_id=schedule.equipment_id,
                type=template.get("type", "preventive"),
                priority=template.get("priority", "medium"),
                status=sm.OPEN, requested_by=_uuid(actor_id),
                due_at=schedule.next_due_at,
                checklist=template.get("checklist", []), parts=template.get("parts", []),
                source="schedule", schedule_id=schedule.id,
                created_by=_uuid(actor_id), updated_by=_uuid(actor_id))
            self.session.add(wo)
            await self.session.flush()
            schedule.last_generated_at = now
            if schedule.interval_days:
                base = schedule.next_due_at or now
                schedule.next_due_at = base + timedelta(days=schedule.interval_days)
            await self.session.flush()
            created.append(wo)
            await self.audit.write(action="workorder.create", entity_type="work_order",
                                   entity_id=wo.id, tenant_id=self.tenant_id, actor_id=actor_id,
                                   after={"wo_number": wo.wo_number, "source": "schedule",
                                          "schedule_id": str(schedule.id)})
            await bus.publish(Event(EventType.WORKORDER_CREATED, tenant_id=str(self.tenant_id),
                                    payload={"work_order_id": str(wo.id), "source": "schedule"}))
            await bus.publish(Event(EventType.NOTIFICATION_CREATED, tenant_id=str(self.tenant_id),
                                    payload={"category": "maintenance",
                                             "title": f"PM due: {schedule.name}",
                                             "entity_type": "work_order", "entity_id": str(wo.id),
                                             "priority": wo.priority}))
        if created:
            log.info("schedules_generated", tenant_id=str(self.tenant_id), count=len(created))
        return created


class FailureService(_LookupMixin):
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = FailureRepository(session, tenant_id)
        self.equipment = EquipmentRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def list(self, params: PageParams, **filters) -> PageResult:
        return await self.repo.list(params, **filters)

    async def get(self, failure_id: uuid.UUID) -> FailureRecord:
        failure = await self.repo.get(failure_id)
        if failure is None:
            raise NotFound("Failure record not found", code="FAILURE_NOT_FOUND")
        return failure

    async def _validate(self, *, equipment_id, failure_mode_id, failure_code_id) -> None:
        field_errors: dict[str, str] = {}
        if equipment_id is not None and await self.equipment.get(equipment_id) is None:
            field_errors["equipment_id"] = "Equipment not found"
        if failure_mode_id is not None and failure_mode_id not in await self._ids("failure_modes"):
            field_errors["failure_mode_id"] = "Unknown failure mode"
        if failure_code_id is not None and failure_code_id not in await self._ids("failure_codes"):
            field_errors["failure_code_id"] = "Unknown failure code"
        if field_errors:
            raise ValidationFailed("Invalid references", code="VALIDATION_ERROR",
                                   http_status=422, field_errors=field_errors)

    async def create(self, *, data, actor) -> FailureRecord:
        await self._validate(equipment_id=data.equipment_id, failure_mode_id=data.failure_mode_id,
                             failure_code_id=data.failure_code_id)
        failure = await self.repo.add(FailureRecord(
            equipment_id=data.equipment_id, work_order_id=data.work_order_id,
            failure_mode_id=data.failure_mode_id, failure_code_id=data.failure_code_id,
            severity=data.severity, occurred_at=data.occurred_at, detected_by=data.detected_by,
            downtime_minutes=data.downtime_minutes, production_loss=data.production_loss,
            description=data.description, rca_status="none",
            created_by=actor.id, updated_by=actor.id))
        await self.audit.write(action="failure.create", entity_type="failure_record",
                               entity_id=failure.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"equipment_id": str(failure.equipment_id)
                                      if failure.equipment_id else None})
        await bus.publish(Event(EventType.FAILURE_RECORDED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id),
                                payload={"failure_id": str(failure.id),
                                         "equipment_id": str(failure.equipment_id)
                                         if failure.equipment_id else None,
                                         "failure_mode_id": str(failure.failure_mode_id)
                                         if failure.failure_mode_id else None}))
        return failure

    async def update(self, failure_id: uuid.UUID, *, data, actor) -> FailureRecord:
        failure = await self.get(failure_id)
        _check_version(failure, data.version)
        await self._validate(equipment_id=None, failure_mode_id=data.failure_mode_id,
                             failure_code_id=data.failure_code_id)
        for field in ("failure_mode_id", "failure_code_id", "severity", "occurred_at",
                      "detected_by", "downtime_minutes", "production_loss", "description",
                      "rca_status"):
            value = getattr(data, field)
            if value is not None:
                setattr(failure, field, value)
        failure.version += 1
        failure.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="failure.update", entity_type="failure_record",
                               entity_id=failure.id, tenant_id=self.tenant_id, actor_id=actor.id)
        return failure

    async def delete(self, failure_id: uuid.UUID, *, actor) -> None:
        from sqlalchemy import func

        failure = await self.get(failure_id)
        failure.deleted_at = func.now()
        failure.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="failure.delete", entity_type="failure_record",
                               entity_id=failure.id, tenant_id=self.tenant_id, actor_id=actor.id)


class MetricsService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = MetricsRepository(session, tenant_id)

    async def compute(self, *, equipment_id=None, area_id=None) -> dict:
        result = await self.repo.compute(equipment_id=equipment_id, area_id=area_id)
        scope = {}
        if equipment_id:
            scope["equipment_id"] = str(equipment_id)
        if area_id:
            scope["area_id"] = str(area_id)
        return {"scope": scope, **result}


def _uuid(value: uuid.UUID | str | None) -> uuid.UUID | None:
    if value is None or isinstance(value, uuid.UUID):
        return value
    return uuid.UUID(str(value))
