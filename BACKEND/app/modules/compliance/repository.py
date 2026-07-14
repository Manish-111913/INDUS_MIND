"""Compliance repositories (docs/02 §7, §19).

Tenant + soft-delete scoping on every query. The coverage query drives the
regulation × area heatmap (mapped/gap/unaddressed counts per clause), computed
with real aggregate SQL over the scan output — no placeholder numbers.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams, PageResult, paginate
from app.modules.compliance.models import (
    Audit,
    ComplianceGap,
    ComplianceMapping,
    EvidencePackage,
    Regulation,
    RegulationClause,
)


class RegulationRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _base(self) -> Select:
        return select(Regulation).where(
            Regulation.tenant_id == self.tenant_id, Regulation.deleted_at.is_(None)
        )

    async def get(self, regulation_id: uuid.UUID | str) -> Regulation | None:
        return (await self.session.execute(
            self._base().where(Regulation.id == regulation_id))).scalar_one_or_none()

    async def get_by_code(self, code: str) -> Regulation | None:
        return (await self.session.execute(
            self._base().where(Regulation.code == code))).scalar_one_or_none()

    async def list(self, params: PageParams, *, body: str | None = None,
                   q: str | None = None) -> PageResult:
        stmt = self._base()
        if body:
            stmt = stmt.where(Regulation.body == body)
        if q:
            like = f"%{q}%"
            stmt = stmt.where(Regulation.title.ilike(like) | Regulation.code.ilike(like))
        return await paginate(self.session, stmt, params, Regulation)

    async def list_all(self) -> list[Regulation]:
        return list((await self.session.execute(self._base())).scalars().all())

    async def add(self, regulation: Regulation) -> Regulation:
        regulation.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(regulation)
        await self.session.flush()
        return regulation


class ClauseRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _base(self) -> Select:
        return select(RegulationClause).where(
            RegulationClause.tenant_id == self.tenant_id, RegulationClause.deleted_at.is_(None)
        )

    async def get(self, clause_id: uuid.UUID | str) -> RegulationClause | None:
        return (await self.session.execute(
            self._base().where(RegulationClause.id == clause_id))).scalar_one_or_none()

    async def get_by_no(self, regulation_id: uuid.UUID | str,
                        clause_no: str) -> RegulationClause | None:
        return (await self.session.execute(self._base().where(
            RegulationClause.regulation_id == regulation_id,
            RegulationClause.clause_no == clause_no))).scalar_one_or_none()

    async def list_for_regulation(self, regulation_id: uuid.UUID | str) -> list[RegulationClause]:
        stmt = (self._base()
                .where(RegulationClause.regulation_id == regulation_id)
                .order_by(RegulationClause.order_index, RegulationClause.clause_no))
        return list((await self.session.execute(stmt)).scalars().all())

    async def list_all(self) -> list[RegulationClause]:
        return list((await self.session.execute(self._base())).scalars().all())

    async def add(self, clause: RegulationClause) -> RegulationClause:
        clause.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(clause)
        await self.session.flush()
        return clause


class MappingRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _base(self) -> Select:
        return select(ComplianceMapping).where(
            ComplianceMapping.tenant_id == self.tenant_id, ComplianceMapping.deleted_at.is_(None)
        )

    async def get(self, mapping_id: uuid.UUID | str) -> ComplianceMapping | None:
        return (await self.session.execute(
            self._base().where(ComplianceMapping.id == mapping_id))).scalar_one_or_none()

    async def find(self, clause_id: uuid.UUID | str, target_type: str,
                   target_id: uuid.UUID | str) -> ComplianceMapping | None:
        return (await self.session.execute(self._base().where(
            ComplianceMapping.clause_id == clause_id,
            ComplianceMapping.target_type == target_type,
            ComplianceMapping.target_id == target_id))).scalar_one_or_none()

    async def list(self, params: PageParams, *, clause_id: uuid.UUID | None = None,
                   status: str | None = None) -> PageResult:
        stmt = self._base()
        if clause_id:
            stmt = stmt.where(ComplianceMapping.clause_id == clause_id)
        if status:
            stmt = stmt.where(ComplianceMapping.status == status)
        stmt = stmt.order_by(ComplianceMapping.mapping_confidence.desc())
        return await paginate(self.session, stmt, params, ComplianceMapping)

    async def list_all(self, *, status: str | None = None) -> list[ComplianceMapping]:
        stmt = self._base()
        if status:
            stmt = stmt.where(ComplianceMapping.status == status)
        return list((await self.session.execute(stmt)).scalars().all())

    async def add(self, mapping: ComplianceMapping) -> ComplianceMapping:
        mapping.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(mapping)
        await self.session.flush()
        return mapping


class GapRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _base(self) -> Select:
        return select(ComplianceGap).where(
            ComplianceGap.tenant_id == self.tenant_id, ComplianceGap.deleted_at.is_(None)
        )

    async def get(self, gap_id: uuid.UUID | str) -> ComplianceGap | None:
        return (await self.session.execute(
            self._base().where(ComplianceGap.id == gap_id))).scalar_one_or_none()

    async def find_open(self, clause_id: uuid.UUID | str | None,
                        equipment_id: uuid.UUID | str | None) -> ComplianceGap | None:
        """An existing non-resolved gap for the same clause+equipment (scan idempotency)."""
        stmt = self._base().where(
            ComplianceGap.clause_id == clause_id,
            ComplianceGap.status.notin_(("resolved", "accepted_risk")),
        )
        if equipment_id is None:
            stmt = stmt.where(ComplianceGap.affected_equipment_id.is_(None))
        else:
            stmt = stmt.where(ComplianceGap.affected_equipment_id == equipment_id)
        return (await self.session.execute(stmt)).scalars().first()

    async def list(self, params: PageParams, *, status: str | None = None,
                   severity: str | None = None, clause_id: uuid.UUID | None = None,
                   equipment_id: uuid.UUID | None = None,
                   detected_by: str | None = None) -> PageResult:
        stmt = self._base()
        if status:
            stmt = stmt.where(ComplianceGap.status == status)
        if severity:
            stmt = stmt.where(ComplianceGap.severity == severity)
        if clause_id:
            stmt = stmt.where(ComplianceGap.clause_id == clause_id)
        if equipment_id:
            stmt = stmt.where(ComplianceGap.affected_equipment_id == equipment_id)
        if detected_by:
            stmt = stmt.where(ComplianceGap.detected_by == detected_by)
        stmt = stmt.order_by(ComplianceGap.created_at.desc())
        return await paginate(self.session, stmt, params, ComplianceGap)

    async def list_all(self, *, status: str | None = None) -> list[ComplianceGap]:
        stmt = self._base()
        if status:
            stmt = stmt.where(ComplianceGap.status == status)
        return list((await self.session.execute(stmt)).scalars().all())

    async def add(self, gap: ComplianceGap) -> ComplianceGap:
        gap.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(gap)
        await self.session.flush()
        return gap


class AuditRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _base(self) -> Select:
        return select(Audit).where(Audit.tenant_id == self.tenant_id, Audit.deleted_at.is_(None))

    async def get(self, audit_id: uuid.UUID | str) -> Audit | None:
        return (await self.session.execute(
            self._base().where(Audit.id == audit_id))).scalar_one_or_none()

    async def list(self, params: PageParams, *, status: str | None = None) -> PageResult:
        stmt = self._base()
        if status:
            stmt = stmt.where(Audit.status == status)
        stmt = stmt.order_by(Audit.scheduled_at.desc().nulls_last())
        return await paginate(self.session, stmt, params, Audit)

    async def add(self, audit: Audit) -> Audit:
        audit.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(audit)
        await self.session.flush()
        return audit


class EvidenceRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _base(self) -> Select:
        return select(EvidencePackage).where(
            EvidencePackage.tenant_id == self.tenant_id, EvidencePackage.deleted_at.is_(None)
        )

    async def get(self, package_id: uuid.UUID | str) -> EvidencePackage | None:
        return (await self.session.execute(
            self._base().where(EvidencePackage.id == package_id))).scalar_one_or_none()

    async def get_by_token(self, token: str) -> EvidencePackage | None:
        return (await self.session.execute(
            self._base().where(EvidencePackage.share_token == token))).scalar_one_or_none()

    async def list(self, params: PageParams, *, status: str | None = None) -> PageResult:
        stmt = self._base()
        if status:
            stmt = stmt.where(EvidencePackage.status == status)
        stmt = stmt.order_by(EvidencePackage.created_at.desc())
        return await paginate(self.session, stmt, params, EvidencePackage)

    async def add(self, package: EvidencePackage) -> EvidencePackage:
        package.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(package)
        await self.session.flush()
        return package


async def clause_counts(session: AsyncSession, tenant_id: uuid.UUID | str) -> dict:
    """Per-clause mapping/gap counts for the coverage heatmap (docs/02 §19)."""
    mapped_rows = (await session.execute(
        select(ComplianceMapping.clause_id,
               func.count().filter(ComplianceMapping.status == "confirmed").label("confirmed"),
               func.count().filter(ComplianceMapping.status == "proposed").label("proposed"))
        .where(ComplianceMapping.tenant_id == tenant_id, ComplianceMapping.deleted_at.is_(None))
        .group_by(ComplianceMapping.clause_id))).all()
    gap_rows = (await session.execute(
        select(ComplianceGap.clause_id, func.count().label("gaps"))
        .where(ComplianceGap.tenant_id == tenant_id, ComplianceGap.deleted_at.is_(None),
               ComplianceGap.status.notin_(("resolved", "accepted_risk")))
        .group_by(ComplianceGap.clause_id))).all()
    mapped = {r.clause_id: {"confirmed": r.confirmed, "proposed": r.proposed} for r in mapped_rows}
    gaps = {r.clause_id: r.gaps for r in gap_rows}
    return {"mapped": mapped, "gaps": gaps}
