"""Maintenance repositories (docs/02 §7, §18, §50).

Tenant + soft-delete scoping on every query. Work-order list carries the full
frontend filter set (status/priority/type/assignee/area/equipment/due-range);
`area_id` filters via the equipment join. Metrics run real aggregate SQL over the
seeded corpus (MTBF/MTTR/PM-compliance/backlog) — no placeholder numbers.
"""

from __future__ import annotations

import builtins  # `list` is shadowed by a `list()` method below
import uuid
from datetime import datetime

from sqlalchemy import Integer, Select, cast, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams, PageResult, paginate
from app.modules.equipment.models import Equipment
from app.modules.maintenance.models import (
    FailureRecord,
    MaintenanceProposal,
    MaintenanceSchedule,
    Prediction,
    RCAAnalysis,
    WorkOrder,
)


class WorkOrderRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _base(self) -> Select:
        return select(WorkOrder).where(
            WorkOrder.tenant_id == self.tenant_id, WorkOrder.deleted_at.is_(None)
        )

    async def get(self, wo_id: uuid.UUID | str) -> WorkOrder | None:
        return (
            await self.session.execute(self._base().where(WorkOrder.id == wo_id))
        ).scalar_one_or_none()

    async def get_by_number(self, wo_number: str) -> WorkOrder | None:
        return (
            await self.session.execute(self._base().where(WorkOrder.wo_number == wo_number))
        ).scalar_one_or_none()

    async def list(
        self, params: PageParams, *,
        status: str | None = None, priority: str | None = None, type: str | None = None,
        assignee_id: uuid.UUID | None = None, equipment_id: uuid.UUID | None = None,
        area_id: uuid.UUID | None = None, source: str | None = None,
        due_from: datetime | None = None, due_to: datetime | None = None,
        q: str | None = None,
    ) -> PageResult:
        stmt = self._base()
        if status:
            stmt = stmt.where(WorkOrder.status == status)
        if priority:
            stmt = stmt.where(WorkOrder.priority == priority)
        if type:
            stmt = stmt.where(WorkOrder.type == type)
        if assignee_id:
            stmt = stmt.where(WorkOrder.assignee_id == assignee_id)
        if equipment_id:
            stmt = stmt.where(WorkOrder.equipment_id == equipment_id)
        if source:
            stmt = stmt.where(WorkOrder.source == source)
        if area_id:
            stmt = stmt.where(
                WorkOrder.equipment_id.in_(
                    select(Equipment.id).where(
                        Equipment.tenant_id == self.tenant_id, Equipment.area_id == area_id
                    )
                )
            )
        if due_from:
            stmt = stmt.where(WorkOrder.due_at >= due_from)
        if due_to:
            stmt = stmt.where(WorkOrder.due_at <= due_to)
        if q:
            like = f"%{q}%"
            stmt = stmt.where(WorkOrder.title.ilike(like) | WorkOrder.wo_number.ilike(like))
        return await paginate(self.session, stmt, params, WorkOrder)

    async def list_for_equipment(self, equipment_id: uuid.UUID | str) -> builtins.list[WorkOrder]:
        stmt = (
            self._base()
            .where(WorkOrder.equipment_id == equipment_id)
            .order_by(WorkOrder.created_at.desc())
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def next_number(self) -> str:
        """`WO-####` with a per-tenant monotonic suffix (base 2001, seeded data lives above)."""
        stmt = (
            select(func.max(cast(func.substring(WorkOrder.wo_number, r"(\d+)$"), Integer)))
            .where(WorkOrder.tenant_id == self.tenant_id)
        )
        current = (await self.session.execute(stmt)).scalar()
        nxt = max(int(current or 0) + 1, 2001)
        return f"WO-{nxt}"

    async def add(self, wo: WorkOrder) -> WorkOrder:
        wo.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(wo)
        await self.session.flush()
        return wo

    async def similar_closed(
        self, equipment_id: uuid.UUID | str, *, limit: int = 5
    ) -> builtins.list[WorkOrder]:
        """Past closed WOs on the same equipment (base for FTS/vector similarity)."""
        stmt = (
            self._base()
            .where(
                WorkOrder.equipment_id == equipment_id,
                WorkOrder.status == "closed",
            )
            .order_by(WorkOrder.closed_at.desc().nulls_last())
            .limit(limit)
        )
        return list((await self.session.execute(stmt)).scalars().all())


class ScheduleRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _base(self) -> Select:
        return select(MaintenanceSchedule).where(
            MaintenanceSchedule.tenant_id == self.tenant_id,
            MaintenanceSchedule.deleted_at.is_(None),
        )

    async def get(self, schedule_id: uuid.UUID | str) -> MaintenanceSchedule | None:
        return (
            await self.session.execute(self._base().where(MaintenanceSchedule.id == schedule_id))
        ).scalar_one_or_none()

    async def list(
        self, params: PageParams, *, equipment_id: uuid.UUID | None = None,
        active: bool | None = None,
    ) -> PageResult:
        stmt = self._base()
        if equipment_id:
            stmt = stmt.where(MaintenanceSchedule.equipment_id == equipment_id)
        if active is not None:
            stmt = stmt.where(MaintenanceSchedule.active.is_(active))
        return await paginate(self.session, stmt, params, MaintenanceSchedule)

    async def list_all(self, *, equipment_id: uuid.UUID | None = None) -> builtins.list[MaintenanceSchedule]:
        stmt = self._base()
        if equipment_id:
            stmt = stmt.where(MaintenanceSchedule.equipment_id == equipment_id)
        return list((await self.session.execute(stmt)).scalars().all())

    async def due(self, *, now: datetime) -> builtins.list[MaintenanceSchedule]:
        stmt = self._base().where(
            MaintenanceSchedule.active.is_(True),
            MaintenanceSchedule.next_due_at.is_not(None),
            MaintenanceSchedule.next_due_at <= now,
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def add(self, schedule: MaintenanceSchedule) -> MaintenanceSchedule:
        schedule.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(schedule)
        await self.session.flush()
        return schedule


class FailureRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _base(self) -> Select:
        return select(FailureRecord).where(
            FailureRecord.tenant_id == self.tenant_id, FailureRecord.deleted_at.is_(None)
        )

    async def get(self, failure_id: uuid.UUID | str) -> FailureRecord | None:
        return (
            await self.session.execute(self._base().where(FailureRecord.id == failure_id))
        ).scalar_one_or_none()

    async def list(
        self, params: PageParams, *, equipment_id: uuid.UUID | None = None,
        failure_mode_id: uuid.UUID | None = None,
    ) -> PageResult:
        stmt = self._base()
        if equipment_id:
            stmt = stmt.where(FailureRecord.equipment_id == equipment_id)
        if failure_mode_id:
            stmt = stmt.where(FailureRecord.failure_mode_id == failure_mode_id)
        return await paginate(self.session, stmt, params, FailureRecord)

    async def list_for_equipment(self, equipment_id: uuid.UUID | str) -> builtins.list[FailureRecord]:
        stmt = (
            self._base()
            .where(FailureRecord.equipment_id == equipment_id)
            .order_by(FailureRecord.occurred_at.desc())
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def add(self, failure: FailureRecord) -> FailureRecord:
        failure.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(failure)
        await self.session.flush()
        return failure

    async def mode_frequencies(
        self, equipment_id: uuid.UUID | str
    ) -> builtins.list[tuple[uuid.UUID | None, int]]:
        stmt = (
            select(FailureRecord.failure_mode_id, func.count().label("n"))
            .where(
                FailureRecord.tenant_id == self.tenant_id,
                FailureRecord.deleted_at.is_(None),
                FailureRecord.equipment_id == equipment_id,
            )
            .group_by(FailureRecord.failure_mode_id)
            .order_by(func.count().desc())
        )
        return [(r[0], r[1]) for r in (await self.session.execute(stmt)).all()]


class ProposalRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _base(self) -> Select:
        return select(MaintenanceProposal).where(
            MaintenanceProposal.tenant_id == self.tenant_id,
            MaintenanceProposal.deleted_at.is_(None),
        )

    async def get(self, proposal_id: uuid.UUID | str) -> MaintenanceProposal | None:
        return (
            await self.session.execute(self._base().where(MaintenanceProposal.id == proposal_id))
        ).scalar_one_or_none()

    async def add(self, proposal: MaintenanceProposal) -> MaintenanceProposal:
        proposal.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(proposal)
        await self.session.flush()
        return proposal


class PredictionRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _base(self) -> Select:
        return select(Prediction).where(
            Prediction.tenant_id == self.tenant_id, Prediction.deleted_at.is_(None)
        )

    async def get(self, prediction_id: uuid.UUID | str) -> Prediction | None:
        return (
            await self.session.execute(self._base().where(Prediction.id == prediction_id))
        ).scalar_one_or_none()

    async def open_for_equipment(self, equipment_id: uuid.UUID | str) -> Prediction | None:
        stmt = self._base().where(
            Prediction.equipment_id == equipment_id, Prediction.status == "open")
        return (await self.session.execute(stmt)).scalars().first()

    async def list(
        self, params: PageParams, *, status: str | None = None, risk_band: str | None = None,
        equipment_id: uuid.UUID | None = None,
    ) -> PageResult:
        stmt = self._base()
        if status:
            stmt = stmt.where(Prediction.status == status)
        if risk_band:
            stmt = stmt.where(Prediction.risk_band == risk_band)
        if equipment_id:
            stmt = stmt.where(Prediction.equipment_id == equipment_id)
        stmt = stmt.order_by(Prediction.risk_score.desc())
        return await paginate(self.session, stmt, params, Prediction)

    async def add(self, prediction: Prediction) -> Prediction:
        prediction.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(prediction)
        await self.session.flush()
        return prediction


class RCARepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _base(self) -> Select:
        return select(RCAAnalysis).where(
            RCAAnalysis.tenant_id == self.tenant_id, RCAAnalysis.deleted_at.is_(None)
        )

    async def get(self, analysis_id: uuid.UUID | str) -> RCAAnalysis | None:
        return (
            await self.session.execute(self._base().where(RCAAnalysis.id == analysis_id))
        ).scalar_one_or_none()

    async def latest_for_failure(self, failure_id: uuid.UUID | str) -> RCAAnalysis | None:
        stmt = (
            self._base()
            .where(RCAAnalysis.failure_id == failure_id)
            .order_by(RCAAnalysis.created_at.desc())
            .limit(1)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def add(self, analysis: RCAAnalysis) -> RCAAnalysis:
        analysis.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(analysis)
        await self.session.flush()
        return analysis


class MetricsRepository:
    """Real aggregate SQL for MTBF/MTTR/PM-compliance/backlog (docs/02 §18, §50)."""

    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _scope_clause(self, equipment_id, area_id) -> tuple[str, dict]:
        params: dict = {"tenant": str(self.tenant_id)}
        clause = ""
        if equipment_id:
            clause = " AND wo.equipment_id = :equipment_id"
            params["equipment_id"] = str(equipment_id)
        elif area_id:
            clause = (
                " AND wo.equipment_id IN (SELECT id FROM equipment "
                "WHERE tenant_id = :tenant AND area_id = :area_id AND deleted_at IS NULL)"
            )
            params["area_id"] = str(area_id)
        return clause, params

    async def compute(self, *, equipment_id=None, area_id=None) -> dict:
        wo_clause, params = self._scope_clause(equipment_id, area_id)

        # MTTR: mean (closed_at - started_at) over closed corrective/failure WOs, in hours.
        mttr_sql = text(
            f"""
            SELECT AVG(EXTRACT(EPOCH FROM (wo.closed_at - wo.started_at)) / 3600.0) AS mttr
            FROM work_orders wo
            WHERE wo.tenant_id = :tenant AND wo.deleted_at IS NULL
              AND wo.status = 'closed' AND wo.started_at IS NOT NULL
              AND wo.closed_at IS NOT NULL{wo_clause}
            """
        )
        mttr = (await self.session.execute(mttr_sql, params)).scalar()

        # Backlog: sum of estimated labour hours on open/in-progress/on-hold/review WOs.
        backlog_sql = text(
            f"""
            SELECT COALESCE(SUM(COALESCE(wo.labor_hours, 4)), 0) AS backlog,
                   COUNT(*) FILTER (WHERE wo.status <> 'closed' AND wo.status <> 'cancelled') AS open_wos,
                   COUNT(*) FILTER (WHERE wo.status NOT IN ('closed','cancelled')
                                    AND wo.due_at IS NOT NULL AND wo.due_at < now()) AS overdue
            FROM work_orders wo
            WHERE wo.tenant_id = :tenant AND wo.deleted_at IS NULL
              AND wo.status NOT IN ('closed','cancelled'){wo_clause}
            """
        )
        backlog_row = (await self.session.execute(backlog_sql, params)).one()

        # PM compliance: closed-on-time / total due PM (preventive/inspection) work orders.
        pm_sql = text(
            f"""
            SELECT
              COUNT(*) FILTER (WHERE wo.type IN ('preventive','inspection')) AS pm_total,
              COUNT(*) FILTER (
                WHERE wo.type IN ('preventive','inspection') AND wo.status = 'closed'
                  AND (wo.due_at IS NULL OR wo.closed_at <= wo.due_at)
              ) AS pm_ontime
            FROM work_orders wo
            WHERE wo.tenant_id = :tenant AND wo.deleted_at IS NULL{wo_clause}
            """
        )
        pm_row = (await self.session.execute(pm_sql, params)).one()

        # MTBF: operating window / number of failures, in hours.
        fail_clause = ""
        fparams: dict = {"tenant": str(self.tenant_id)}
        if equipment_id:
            fail_clause = " AND fr.equipment_id = :equipment_id"
            fparams["equipment_id"] = str(equipment_id)
        elif area_id:
            fail_clause = (
                " AND fr.equipment_id IN (SELECT id FROM equipment "
                "WHERE tenant_id = :tenant AND area_id = :area_id AND deleted_at IS NULL)"
            )
            fparams["area_id"] = str(area_id)
        mtbf_sql = text(
            f"""
            SELECT COUNT(*) AS failures,
                   MIN(fr.occurred_at) AS first_at,
                   MAX(fr.occurred_at) AS last_at,
                   COALESCE(SUM(fr.downtime_minutes), 0) AS downtime_min
            FROM failure_records fr
            WHERE fr.tenant_id = :tenant AND fr.deleted_at IS NULL{fail_clause}
            """
        )
        mtbf_row = (await self.session.execute(mtbf_sql, fparams)).one()

        failures = int(mtbf_row.failures or 0)
        mtbf_hours: float | None = None
        if failures >= 1 and mtbf_row.first_at and mtbf_row.last_at:
            span_hours = (mtbf_row.last_at - mtbf_row.first_at).total_seconds() / 3600.0
            uptime = max(span_hours - (int(mtbf_row.downtime_min or 0) / 60.0), 0.0)
            # failures partition the span into (n) intervals from first occurrence to now-ish.
            mtbf_hours = round(uptime / failures, 1) if uptime > 0 else None

        pm_total = int(pm_row.pm_total or 0)
        pm_compliance = round(100.0 * int(pm_row.pm_ontime or 0) / pm_total, 1) if pm_total else None

        return {
            "mtbf_hours": mtbf_hours,
            "mttr_hours": round(float(mttr), 1) if mttr is not None else None,
            "pm_compliance": pm_compliance,
            "backlog_hours": round(float(backlog_row.backlog or 0), 1),
            "open_work_orders": int(backlog_row.open_wos or 0),
            "overdue_work_orders": int(backlog_row.overdue or 0),
            "failures": failures,
        }
