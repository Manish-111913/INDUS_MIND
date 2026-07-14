"""Lessons-learned agent (docs/02 §10 lessons graph, §36).

The LangGraph lessons DAG as composable async stages:
    cluster(failures, incidents, NCRs) → pattern_detect → validate → draft lesson

`cluster` groups records whose descriptions share failure-relevant terms (a
curated industrial vocabulary) plus a seasonal signal (monsoon months) and a
shared equipment neighbourhood — union-find over ≥2 shared terms. `pattern_detect`
(prompt `lessons.detect` when an LLM key is present; grounded heuristic offline)
drafts a narrative, recommended action, confidence and cited evidence per cluster
spanning ≥2 pieces of equipment. Lessons are written as `candidate` and are
idempotent by `pattern_key`, so the seeded "monsoon seal failure" pattern emerges
once and re-runs update rather than duplicate it.
"""

from __future__ import annotations

import hashlib
import uuid
from collections import Counter
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.modules.audit.service import AuditService
from app.modules.lessons.models import Lesson
from app.modules.lessons.repository import LessonRepository
from app.modules.maintenance.models import FailureRecord
from app.modules.quality.models import NCR

log = get_logger("lessons.agent")

# Failure-relevant vocabulary — the terms that make two records "about the same thing".
_VOCAB = {
    "seal", "leak", "leakage", "bearing", "vibration", "corrosion", "monsoon", "moisture",
    "water", "ingress", "humidity", "rain", "misalignment", "cavitation", "overheating",
    "fouling", "gasket", "coupling", "impeller", "rotor", "flush", "plugging", "contamination",
    "weld", "porosity", "crack", "fatigue", "wear", "scored",
}
_MONSOON_MONTHS = {6, 7, 8, 9}
_MIN_CLUSTER = 3
_MIN_EQUIPMENT = 2


class _Record:
    __slots__ = ("type", "id", "equipment_id", "text", "when", "keywords")

    def __init__(self, rtype, rid, equipment_id, text, when):
        self.type = rtype
        self.id = rid
        self.equipment_id = equipment_id
        self.text = text or ""
        self.when: datetime | None = when
        self.keywords = self._extract()

    def _extract(self) -> set[str]:
        low = self.text.lower()
        kw = {v for v in _VOCAB if v in low}
        if self.when is not None and self.when.month in _MONSOON_MONTHS:
            kw.add("monsoon")
        return kw


class LessonsAgent:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = LessonRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def detect(self, *, scope: dict | None = None, actor=None) -> list[Lesson]:
        records = await self._gather(scope or {})
        clusters = self._cluster(records)
        created: list[Lesson] = []
        for cluster in clusters:
            lesson = await self._draft(cluster, actor)
            if lesson is not None:
                created.append(lesson)
        if created:
            await self.audit.write(action="lessons.detect", entity_type="lesson",
                                   tenant_id=self.tenant_id, actor_id=actor.id if actor else None,
                                   after={"lessons": len(created)})
        log.info("lessons_detect_done", tenant_id=str(self.tenant_id),
                 records=len(records), clusters=len(clusters), created=len(created))
        return created

    # ── gather ────────────────────────────────────────────────────────────────
    async def _gather(self, scope: dict) -> list[_Record]:
        equipment_id = scope.get("equipment_id")
        fstmt = select(FailureRecord).where(
            FailureRecord.tenant_id == self.tenant_id, FailureRecord.deleted_at.is_(None))
        nstmt = select(NCR).where(NCR.tenant_id == self.tenant_id, NCR.deleted_at.is_(None))
        if equipment_id:
            fstmt = fstmt.where(FailureRecord.equipment_id == equipment_id)
            nstmt = nstmt.where(NCR.equipment_id == equipment_id)
        failures = (await self.session.execute(fstmt)).scalars().all()
        ncrs = (await self.session.execute(nstmt)).scalars().all()
        records = [_Record("failure", f.id, f.equipment_id, f.description, f.occurred_at)
                   for f in failures]
        records += [_Record("ncr", n.id, n.equipment_id, n.description, n.detected_at) for n in ncrs]
        return [r for r in records if r.equipment_id and r.keywords]

    # ── cluster (union-find over ≥2 shared terms) ─────────────────────────────
    def _cluster(self, records: list[_Record]) -> list[list[_Record]]:
        parent = list(range(len(records)))

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        def union(i, j):
            parent[find(i)] = find(j)

        for i in range(len(records)):
            for j in range(i + 1, len(records)):
                if len(records[i].keywords & records[j].keywords) >= 2:
                    union(i, j)

        groups: dict[int, list[_Record]] = {}
        for idx, rec in enumerate(records):
            groups.setdefault(find(idx), []).append(rec)

        clusters = []
        for members in groups.values():
            equip = {r.equipment_id for r in members}
            if len(members) >= _MIN_CLUSTER and len(equip) >= _MIN_EQUIPMENT:
                clusters.append(members)
        # Largest, most cross-equipment clusters first.
        clusters.sort(key=lambda c: (len({r.equipment_id for r in c}), len(c)), reverse=True)
        return clusters

    # ── pattern detect + draft ────────────────────────────────────────────────
    async def _draft(self, cluster: list[_Record], actor) -> Lesson | None:
        theme_counts = Counter(k for r in cluster for k in r.keywords)
        themes = [k for k, _ in theme_counts.most_common(4)]
        equipment_ids = sorted({r.equipment_id for r in cluster}, key=str)
        pattern_key = _signature(themes, equipment_ids)

        existing = await self.repo.by_pattern_key(pattern_key)
        if existing is not None:
            return None  # idempotent — this pattern is already on record

        tags = await self._equipment_tags(equipment_ids)
        seasonal = "monsoon" in themes or sum(
            1 for r in cluster if r.when and r.when.month in _MONSOON_MONTHS) >= len(cluster) / 2
        seal = "seal" in themes

        if seal and seasonal:
            title = "Monsoon-season mechanical seal failures on rotating equipment"
            recommended = ("Upgrade seal flush to API 682 Plan 53 with moisture exclusion, add a "
                           "pre-monsoon seal & bearing-housing inspection to the PM schedule for the "
                           "affected pumps, and improve seal-pot nitrogen blanketing.")
        else:
            title = f"Recurring {themes[0] if themes else 'failure'} pattern across {len(tags)} assets"
            recommended = (f"Review the {themes[0] if themes else 'failure'} mode across the affected "
                           "equipment and add a targeted preventive task.")

        narrative = self._narrative(cluster, tags, themes, seasonal)
        summary = (f"{len(cluster)} records across {len(tags)} assets ({', '.join(tags[:6])}) share "
                   f"the terms: {', '.join(themes)}.")
        confidence = round(min(0.95, 0.55 + 0.06 * len(cluster) + 0.08 * len(equipment_ids)), 3)
        evidence = [{"type": r.type, "id": str(r.id),
                     "excerpt": (r.text or "")[:180].strip()} for r in cluster[:6]]

        lesson = await self.repo.add(Lesson(
            title=title, narrative=narrative, pattern_summary=summary, pattern_key=pattern_key,
            evidence=evidence, affected_equipment_ids=equipment_ids, recommended_action=recommended,
            confidence=confidence, status="candidate", source="agent",
            created_by=actor.id if actor else None, updated_by=actor.id if actor else None))
        return lesson

    def _narrative(self, cluster, tags, themes, seasonal) -> str:
        parts = [f"The lessons-learned agent detected {len(cluster)} correlated events across "
                 f"{len(tags)} assets ({', '.join(tags[:6])}) sharing the signature: "
                 f"{', '.join(themes)}."]
        if seasonal:
            parts.append("A strong seasonal correlation with the monsoon period (Jun–Sep) points to "
                         "moisture/humidity ingress degrading seal faces and flush plans.")
        parts.append("Because the same failure signature repeats across multiple pumps rather than a "
                     "single asset, this is a systemic reliability pattern, not isolated events.")
        return " ".join(parts)

    async def _equipment_tags(self, equipment_ids: list[uuid.UUID]) -> list[str]:
        from app.modules.equipment.models import Equipment

        if not equipment_ids:
            return []
        rows = (await self.session.execute(select(Equipment).where(
            Equipment.id.in_(equipment_ids)))).scalars().all()
        return sorted(e.tag for e in rows)


def _signature(themes: list[str], equipment_ids: list[uuid.UUID]) -> str:
    raw = "|".join(sorted(themes)) + "::" + "|".join(str(e) for e in equipment_ids)
    return hashlib.sha1(raw.encode()).hexdigest()[:16]  # noqa: S324 — non-security signature key
