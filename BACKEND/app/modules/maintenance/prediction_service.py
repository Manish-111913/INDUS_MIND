"""Predictive-maintenance engine v1 (docs/02 §10 agents, §14 predictions).

HONEST HEURISTIC — not a trained model. Risk blends four transparent signals:
  · failure_frequency   — count of recorded failures
  · repeat_mode_momentum — recency-weighted dominance of one failure mode
  · overdue_maintenance — worst overdue active schedule vs its interval
  · criticality_weight  — A/B/C importance
Each signal is surfaced verbatim in `drivers` (explainability), and the
recommendation cites the actual history records. When an LLM is configured
(prompt `maint.predict_explain`) it refines the recommendation narrative; the
numbers stay the heuristic's. Accepting a prediction spawns a WO and links
`acted_wo_id`; dismissing stores the reason (feedback loop).
"""

from __future__ import annotations

import builtins  # `list` is shadowed by a `list()` method below
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams, PageResult
from app.core.events import Event, EventType, bus
from app.core.exceptions import ConflictError, NotFound
from app.core.logging import get_logger
from app.modules.audit.service import AuditService
from app.modules.equipment.models import Equipment
from app.modules.maintenance.models import Prediction
from app.modules.maintenance.repository import (
    FailureRepository,
    PredictionRepository,
    ScheduleRepository,
)
from app.modules.maintenance.schemas import WorkOrderCreate

log = get_logger("maintenance.predictions")

CRIT_WEIGHT = {"A": 1.0, "B": 0.6, "C": 0.3}
BAND_HIGH, BAND_MEDIUM = 55.0, 30.0
WINDOW_DAYS = {"high": 30, "medium": 60, "low": 90}

# Signal weights + reading window resolve from the settings service (docs/05 S5);
# these are only the fallbacks used if a settings key is somehow absent.
_WEIGHT_DEFAULTS = {
    "trend": 0.20, "threshold": 0.15, "failure_freq": 0.20,
    "repeat_mode": 0.15, "overdue": 0.20, "criticality": 0.10,
}
_WINDOW_DEFAULT = 20


@dataclass(slots=True)
class _Score:
    risk: float
    band: str
    mode: str | None
    drivers: list[dict]
    recommendation: str
    citations: list[dict]


@dataclass(slots=True)
class _Condition:
    """Reading-derived signals for one piece of equipment (docs/05 S5)."""
    trend: float = 0.0       # 0..1 — normalised worsening slope of the last-N readings
    threshold: float = 0.0   # 0..1 — proximity of the latest reading to its normal-band edge
    detail: str | None = None


class PredictionService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = PredictionRepository(session, tenant_id)
        self.failures = FailureRepository(session, tenant_id)
        self.schedules = ScheduleRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def list(self, params: PageParams, *, status=None, risk_band=None,
                   equipment_id=None) -> PageResult:
        return await self.repo.list(params, status=status, risk_band=risk_band,
                                    equipment_id=equipment_id)

    async def get(self, prediction_id: uuid.UUID) -> Prediction:
        pred = await self.repo.get(prediction_id)
        if pred is None:
            raise NotFound("Prediction not found", code="PREDICTION_NOT_FOUND")
        return pred

    # ── engine ───────────────────────────────────────────────────────────────
    async def refresh(self, *, criticality: str | None = None, actor=None) -> builtins.list[Prediction]:
        """Recompute predictions for the at-risk equipment set (idempotent upsert)."""
        from app.modules.lookups.service import LookupService

        now = datetime.now(UTC)
        mode_labels = {r.id: r.label for r in
                       await LookupService(self.session, self.tenant_id).by_category("failure_modes")}
        weights, window_n = await self._load_weights()
        equipment = await self._at_risk_equipment(criticality)
        out: list[Prediction] = []
        for eq in equipment:
            failures = await self.failures.list_for_equipment(eq.id)
            schedules = await self.schedules.list_all(equipment_id=eq.id)
            condition = await self._condition_signals(eq.id, window_n)
            has_condition = condition.trend > 0 or condition.threshold > 0
            if not failures and not _has_overdue(schedules, now) and not has_condition:
                continue
            score = self._score(eq, failures, schedules, mode_labels, now, weights, condition)
            pred = await self._upsert(eq, score, now, actor)
            out.append(pred)
            if pred.risk_band == "high":
                await bus.publish(Event(
                    EventType.PREDICTION_CREATED, tenant_id=str(self.tenant_id),
                    payload={"prediction_id": str(pred.id), "equipment_id": str(eq.id),
                             "tag": eq.tag, "risk_score": float(pred.risk_score),
                             "notify": True}))
        return out

    async def _at_risk_equipment(self, criticality: str | None) -> builtins.list[Equipment]:
        stmt = select(Equipment).where(
            Equipment.tenant_id == self.tenant_id, Equipment.deleted_at.is_(None))
        if criticality:
            stmt = stmt.where(Equipment.criticality == criticality)
        return list((await self.session.execute(stmt)).scalars())

    async def _load_weights(self) -> tuple[dict, int]:
        """Resolve signal weights + reading window from the settings service (no constants)."""
        from app.modules.settings.service import SettingsService

        eff = await SettingsService(self.session, self.tenant_id).effective(user_id=None)
        weights = {k: _as_float(eff.get(f"prediction.weight_{k}"), default)
                   for k, default in _WEIGHT_DEFAULTS.items()}
        window_n = int(_as_float(eff.get("prediction.reading_window_n"), _WINDOW_DEFAULT))
        return weights, max(2, window_n)

    async def _condition_signals(self, equipment_id, window_n: int) -> _Condition:
        """Trend slope + threshold proximity from the last-N readings per meter (docs/05 S5)."""
        from app.modules.meters.repository import (
            EquipmentMeterRepository,
            MeterDefinitionRepository,
            MeterReadingRepository,
        )

        links = await EquipmentMeterRepository(
            self.session, self.tenant_id).list_for_equipment(equipment_id)
        if not links:
            return _Condition()
        defs = {d.id: d for d in await MeterDefinitionRepository(
            self.session, self.tenant_id).list()}
        readings_repo = MeterReadingRepository(self.session, self.tenant_id)
        best = _Condition()
        for link in links:
            definition = defs.get(link.meter_definition_id)
            if definition is None:
                continue
            readings = await readings_repo.last_n(link.id, window_n)
            if len(readings) < 2:
                continue
            values = [float(r.value) for r in readings]
            lo = float(definition.normal_min) if definition.normal_min is not None else None
            hi = float(definition.normal_max) if definition.normal_max is not None else None
            trend = _trend_signal(values, lo, hi)
            threshold = _threshold_signal(values[-1], lo, hi)
            if trend + threshold > best.trend + best.threshold:
                best = _Condition(trend=trend, threshold=threshold,
                                  detail=f"{definition.name}: latest {values[-1]:g}"
                                         f"{(' ' + definition.unit) if definition.unit else ''}")
        return best

    def _score(self, eq: Equipment, failures, schedules, mode_labels, now,
               weights: dict, condition: _Condition) -> _Score:
        n_fail = len(failures)
        freq = min(1.0, n_fail / 4.0)

        recent = [f for f in failures if f.occurred_at and (now - f.occurred_at).days <= 365]
        mode_counts = Counter(f.failure_mode_id for f in recent if f.failure_mode_id)
        dom_mode_id, dom_count = (mode_counts.most_common(1)[0] if mode_counts else (None, 0))
        momentum = min(1.0, dom_count / 3.0)
        dom_label = mode_labels.get(dom_mode_id) if dom_mode_id else None

        overdue_days, overdue_sched = _worst_overdue(schedules, now)
        overdue = 1.0 if overdue_days > 0 else 0.0
        crit_weight = CRIT_WEIGHT.get(eq.criticality, 0.3)

        risk = 100.0 * (
            weights["failure_freq"] * freq + weights["repeat_mode"] * momentum
            + weights["overdue"] * overdue + weights["criticality"] * crit_weight
            + weights["trend"] * condition.trend + weights["threshold"] * condition.threshold)
        band = "high" if risk >= BAND_HIGH else ("medium" if risk >= BAND_MEDIUM else "low")

        drivers: list[dict] = []
        if n_fail:
            drivers.append({"factor": "failure_frequency",
                            "detail": f"{n_fail} failure record(s) on {eq.tag}",
                            "weight": round(freq, 2)})
        if dom_count >= 2:
            drivers.append({"factor": "repeat_failure_mode",
                            "detail": f"{dom_count}× {dom_label or 'same mode'} (dominant, last 12 months)",
                            "weight": round(momentum, 2)})
        if overdue_days > 0:
            drivers.append({"factor": "overdue_maintenance",
                            "detail": f"{overdue_days} days overdue: {overdue_sched}",
                            "weight": round(overdue, 2)})
        if condition.trend > 0.05:
            drivers.append({"factor": "reading_trend",
                            "detail": f"Worsening trend — {condition.detail}",
                            "weight": round(condition.trend, 2)})
        if condition.threshold > 0.05:
            drivers.append({"factor": "threshold_proximity",
                            "detail": f"Near/over normal band — {condition.detail}",
                            "weight": round(condition.threshold, 2)})
        drivers.append({"factor": "criticality",
                        "detail": f"Criticality {eq.criticality}", "weight": round(crit_weight, 2)})

        citations = [{"type": "failure", "id": str(f.id),
                      "snippet": (f.description or "")[:160]} for f in recent[:4]]
        if overdue_sched:
            citations.append({"type": "schedule", "snippet": overdue_sched})
        if condition.detail:
            citations.append({"type": "reading", "snippet": condition.detail})

        recommendation = self._recommend(eq, dom_label, dom_count, overdue_days, overdue_sched)
        mode = dom_label or ("overdue maintenance" if overdue_days else None) \
            or ("condition trend" if condition.trend > 0.05 else None)
        return _Score(risk=round(risk, 1), band=band, mode=mode,
                      drivers=drivers, recommendation=recommendation, citations=citations)

    @staticmethod
    def _recommend(eq, dom_label, dom_count, overdue_days, overdue_sched) -> str:
        parts = []
        if overdue_days > 0:
            parts.append(f"Complete the overdue '{overdue_sched}' on {eq.tag} immediately "
                         f"({overdue_days} days late).")
        if dom_count >= 2:
            parts.append(f"Investigate the recurring {dom_label or 'failure'} on {eq.tag} "
                         f"({dom_count} occurrences) — consider a design or PM-interval change.")
        if not parts:
            parts.append(f"Monitor {eq.tag}; no dominant risk driver yet.")
        return " ".join(parts)

    async def _upsert(self, eq: Equipment, score: _Score, now, actor) -> Prediction:
        window_end = now + timedelta(days=WINDOW_DAYS[score.band])
        existing = await self.repo.open_for_equipment(eq.id)
        actor_id = actor.id if actor else None
        if existing is not None:
            existing.risk_score = Decimal(str(score.risk))
            existing.risk_band = score.band
            existing.predicted_failure_mode = score.mode
            existing.window_start = now
            existing.window_end = window_end
            existing.drivers = score.drivers
            existing.recommendation = score.recommendation
            existing.citations = score.citations
            existing.updated_by = actor_id
            await self.session.flush()
            return existing
        return await self.repo.add(Prediction(
            equipment_id=eq.id, risk_score=score.risk, risk_band=score.band,
            predicted_failure_mode=score.mode, window_start=now, window_end=window_end,
            drivers=score.drivers, recommendation=score.recommendation, citations=score.citations,
            status="open", created_by=actor_id, updated_by=actor_id))

    # ── actions (feedback loop) ──────────────────────────────────────────────
    async def accept(self, prediction_id: uuid.UUID, *, actor) -> tuple[Prediction, uuid.UUID]:
        from app.modules.maintenance.service import WorkOrderService

        pred = await self.get(prediction_id)
        if pred.status != "open":
            raise ConflictError(f"Prediction already {pred.status}", code="PREDICTION_NOT_OPEN")
        wo = await WorkOrderService(self.session, self.tenant_id).create(
            data=WorkOrderCreate(
                title=f"Predictive: mitigate {pred.predicted_failure_mode or 'risk'}",
                description=pred.recommendation, equipment_id=pred.equipment_id,
                type="predictive", priority="high" if pred.risk_band == "high" else "medium",
                due_at=pred.window_end),
            actor=actor, source="prediction")
        pred.status = "accepted"
        pred.acted_wo_id = wo.id
        pred.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="prediction.accept", entity_type="prediction",
                               entity_id=pred.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"acted_wo_id": str(wo.id)})
        await bus.publish(Event(EventType.PREDICTION_ACCEPTED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id),
                                payload={"prediction_id": str(pred.id), "work_order_id": str(wo.id)}))
        return pred, wo.id

    async def dismiss(self, prediction_id: uuid.UUID, *, reason: str, actor) -> Prediction:
        pred = await self.get(prediction_id)
        if pred.status != "open":
            raise ConflictError(f"Prediction already {pred.status}", code="PREDICTION_NOT_OPEN")
        pred.status = "dismissed"
        pred.dismiss_reason = reason
        pred.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="prediction.dismiss", entity_type="prediction",
                               entity_id=pred.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"reason": reason})
        return pred


def _as_float(value, default: float) -> float:
    try:
        return float(value) if value is not None else default
    except (ValueError, TypeError):
        return default


def _trend_signal(values: list[float], lo: float | None, hi: float | None) -> float:
    """Normalised worsening slope over the reading window → 0..1.

    Least-squares slope per step, scaled by the window length and the normal-band
    width, so a rise that would traverse the whole band across the window ≈ 1.0.
    Only *rising* trends count as risk (vibration/temperature go up as things fail).
    """
    n = len(values)
    if n < 2:
        return 0.0
    xs = list(range(n))
    mean_x = sum(xs) / n
    mean_y = sum(values) / n
    denom = sum((x - mean_x) ** 2 for x in xs)
    if denom == 0:
        return 0.0
    slope = sum((xs[i] - mean_x) * (values[i] - mean_y) for i in range(n)) / denom
    if slope <= 0:
        return 0.0
    band = (hi - lo) if (lo is not None and hi is not None and hi > lo) else (abs(mean_y) or 1.0)
    return max(0.0, min(1.0, slope * (n - 1) / band))


def _threshold_signal(latest: float, lo: float | None, hi: float | None) -> float:
    """Proximity of the latest reading to (or past) its normal-band ceiling → 0..1."""
    if hi is None:
        return 0.0
    if latest >= hi:
        return 1.0
    floor = lo if lo is not None else min(latest, hi)
    if hi <= floor:
        return 0.0
    return max(0.0, min(1.0, (latest - floor) / (hi - floor)))


def _has_overdue(schedules, now) -> bool:
    return any(s.active and s.next_due_at and s.next_due_at < now for s in schedules)


def _worst_overdue(schedules, now) -> tuple[int, str | None]:
    worst_days, worst_name = 0, None
    for s in schedules:
        if s.active and s.next_due_at and s.next_due_at < now:
            days = (now - s.next_due_at).days
            if days >= worst_days:
                worst_days, worst_name = days, s.name
    return worst_days, worst_name
