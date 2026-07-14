"""Schedule optimization proposal + apply (docs/02 §18, §38).

`POST /maintenance/schedules/optimize {scope}` runs the `maint.optimize` prompt
template over the in-scope schedules and their equipment criticality/history, and
persists the LLM's before/after diff as a reviewable proposal (nothing is mutated
yet). `POST /maintenance/proposals/{id}/apply` applies the accepted diff to the
schedules and marks the proposal applied (idempotent). When no LLM key is
configured a deterministic heuristic proposal is produced (docs/02 §30) — the
seam and contract stay identical.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import llm
from app.core.config import settings
from app.core.events import Event, EventType, bus
from app.core.exceptions import NotFound, ValidationFailed
from app.core.logging import get_logger
from app.modules.ai.repository import PromptRepository
from app.modules.audit.service import AuditService
from app.modules.equipment.repository import EquipmentRepository
from app.modules.maintenance.models import MaintenanceProposal
from app.modules.maintenance.repository import (
    FailureRepository,
    ProposalRepository,
    ScheduleRepository,
)

log = get_logger("maintenance.optimize")

# Criticality → recommended PM interval ceiling (days). Higher criticality → tighter PM.
_CRIT_CEILING = {"A": 30, "B": 90, "C": 180}


class OptimizeService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.schedules = ScheduleRepository(session, tenant_id)
        self.equipment = EquipmentRepository(session, tenant_id)
        self.failures = FailureRepository(session, tenant_id)
        self.proposals = ProposalRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def optimize(self, *, scope: dict, actor) -> MaintenanceProposal:
        equipment_id = scope.get("equipment_id")
        schedules = await self.schedules.list_all(
            equipment_id=uuid.UUID(equipment_id) if equipment_id else None)
        if not schedules:
            raise ValidationFailed("No schedules in scope to optimize",
                                   code="NO_SCHEDULES", http_status=422)

        # Build the heuristic diff (also the offline fallback and the LLM's grounding).
        changes: list[dict] = []
        for s in schedules:
            crit = "C"
            if s.equipment_id:
                eq = await self.equipment.get(s.equipment_id)
                crit = eq.criticality if eq else "C"
            n_failures = 0
            if s.equipment_id:
                n_failures = sum(n for _, n in await self.failures.mode_frequencies(s.equipment_id))
            ceiling = _CRIT_CEILING.get(crit, 180)
            proposed = min(s.interval_days or ceiling, ceiling)
            if n_failures >= 2:
                proposed = max(int(proposed * 0.75), 7)  # tighten on repeat failures
            if proposed != (s.interval_days or ceiling):
                changes.append({
                    "schedule_id": str(s.id), "name": s.name,
                    "before": {"interval_days": s.interval_days},
                    "after": {"interval_days": proposed},
                    "rationale": f"criticality {crit}, {n_failures} recorded failure(s) "
                                 f"→ target interval {proposed}d",
                })

        prompt_version, rationale = await self._llm_rationale(scope, changes)
        diff = {"changes": changes,
                "summary": f"{len(changes)} schedule(s) proposed for change out of {len(schedules)}"}
        proposal = await self.proposals.add(MaintenanceProposal(
            kind="schedule_optimize", scope=scope, status="proposed", diff=diff,
            rationale=rationale, prompt_version=prompt_version,
            created_by=actor.id, updated_by=actor.id))
        await self.audit.write(action="maintenance.optimize", entity_type="maintenance_proposal",
                               entity_id=proposal.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"changes": len(changes)})
        await bus.publish(Event(EventType.MAINT_PROPOSAL_CREATED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id), payload={"proposal_id": str(proposal.id)}))
        return proposal

    async def _llm_rationale(self, scope: dict, changes: list[dict]) -> tuple[int | None, str]:
        template = await PromptRepository(self.session).active(self.tenant_id, "maint.optimize")
        prompt_version = template.version if template else None
        if not (settings.anthropic_api_key or settings.openai_api_key) or template is None:
            return prompt_version, (
                f"Heuristic optimization: {len(changes)} schedule(s) adjusted by equipment "
                "criticality and failure history (offline mode).")
        from app.modules.ai.service import PromptService

        rendered = await PromptService(self.session).render(
            self.tenant_id, "maint.optimize",
            {"scope": json.dumps(scope), "proposed_changes": json.dumps(changes)})
        resp = await llm.complete(self.session, self.tenant_id, "chat",
                                  messages=[llm.LLMMessage(role="user", content=rendered)])
        return prompt_version, resp.text.strip() or "See proposed changes."

    async def apply(self, proposal_id: uuid.UUID, *, actor) -> MaintenanceProposal:
        proposal = await self.proposals.get(proposal_id)
        if proposal is None:
            raise NotFound("Proposal not found", code="PROPOSAL_NOT_FOUND")
        if proposal.applied_at is not None:
            raise ValidationFailed("Proposal already applied", code="PROPOSAL_APPLIED",
                                   http_status=422)
        applied = 0
        for change in proposal.diff.get("changes", []):
            schedule = await self.schedules.get(change["schedule_id"])
            if schedule is None:
                continue
            after = change.get("after", {})
            if "interval_days" in after:
                schedule.interval_days = after["interval_days"]
            schedule.version += 1
            schedule.updated_by = actor.id
            applied += 1
        proposal.status = "applied"
        proposal.applied_at = datetime.now(UTC)
        proposal.applied_by = actor.id
        proposal.version += 1
        proposal.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="maintenance.proposal_apply",
                               entity_type="maintenance_proposal", entity_id=proposal.id,
                               tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"applied": applied})
        return proposal
