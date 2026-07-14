"""Federated search + typeahead + saved searches (docs/02 §27).

Response shapes are aligned to the frontend contract (SearchResults / command
palette): `/search` → `{results:[{id,title,type,snippet,source,relevance,
matchType,plant,date,status,link}]}`; `/search/suggest` →
`{Documents,Equipment,WorkOrders,Regulations,Actions}` of `{id,name,category,
desc,route}`. Documents come from the shared RetrievalService; equipment via
trgm; graph via Neo4j; work-orders/regulations via the federated registry.
"""

from __future__ import annotations

import html
import re
import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.modules.documents.models import Document
from app.modules.equipment.models import Equipment, Plant
from app.modules.knowledge.providers import federated_registry
from app.modules.knowledge.retrieval import RetrievalScope, RetrievalService
from app.modules.knowledge.service import GraphQuery
from app.modules.lookups.service import LookupService

log = get_logger("knowledge.search")

# Canned command-palette actions (docs/01 §12, mock parity).
CANNED_ACTIONS = [
    {"id": "action-create-wo", "name": "Create work order", "category": "Actions",
     "desc": "Dispatch a work order for equipment maintenance", "route": "#maintenance?action=create"},
    {"id": "action-ingest-doc", "name": "Ingest new document", "category": "Actions",
     "desc": "Upload SOPs, manuals or inspection reports", "route": "#documents?action=upload"},
    {"id": "action-audit-log", "name": "View audit log", "category": "Actions",
     "desc": "Inspect security events & tamper-proof logs", "route": "#admin/audit-log"},
    {"id": "action-compliance-gap", "name": "Run compliance gap diagnostics", "category": "Actions",
     "desc": "Evaluate active non-compliance risks", "route": "#compliance"},
    {"id": "action-ask-copilot", "name": "Ask the Expert Copilot", "category": "Actions",
     "desc": "Open Copilot for a natural-language query", "route": "#copilot"},
]


def _highlight(text: str, query: str, width: int = 220) -> str:
    terms = [t for t in re.split(r"\W+", query) if len(t) > 1]
    lowered = text.lower()
    pos = min((lowered.find(t.lower()) for t in terms if t.lower() in lowered), default=-1)
    start = max(0, pos - width // 3) if pos >= 0 else 0
    snippet = text[start:start + width].strip()
    escaped = html.escape(snippet)
    for term in sorted(set(terms), key=len, reverse=True):
        escaped = re.sub(f"({re.escape(html.escape(term))})", r"<em>\1</em>", escaped,
                         flags=re.IGNORECASE)
    prefix = "…" if start > 0 else ""
    suffix = "…" if start + width < len(text) else ""
    return f"{prefix}{escaped}{suffix}"


class SearchService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.lookups = LookupService(session, tenant_id)

    async def search(self, query: str, *, types: set[str] | None = None,
                     scope: RetrievalScope | None = None, limit: int = 10) -> dict:
        results: list[dict] = []

        def want(t: str) -> bool:
            return not types or t in types

        if want("Documents"):
            results += await self._documents(query, scope, limit)
        if want("Equipment"):
            results += await self._equipment(query, limit)
        if want("Graph"):
            results += await self._graph(query, limit)
        results += await federated_registry.search(self.session, self.tenant_id, query, types, limit)

        results.sort(key=lambda r: r["relevance"], reverse=True)
        return {"results": results}

    # ── documents (shared retrieval) ─────────────────────────────────────────
    async def _documents(self, query: str, scope: RetrievalScope | None, limit: int) -> list[dict]:
        chunks = await RetrievalService(self.session, self.tenant_id).retrieve(
            query, scope=scope, top_k=limit * 2)
        if not chunks:
            return []
        docs = {
            d.id: d for d in (await self.session.execute(
                select(Document).where(Document.id.in_({c.document_id for c in chunks})))).scalars()
        }
        plant_names = await self._plant_names()
        type_labels = {r.id: r.label for r in await self.lookups.by_category("doc_types")}
        top = chunks[0].score or 1.0
        items, seen = [], set()
        for c in chunks:
            if c.document_id in seen or c.document_id not in docs:
                continue
            seen.add(c.document_id)
            d = docs[c.document_id]
            items.append({
                "id": str(d.id), "title": d.title, "type": "Documents",
                "snippet": _highlight(c.text, query),
                "source": type_labels.get(d.doc_type_id) or "Documents",
                "relevance": int(round(min(99, 60 + 39 * (c.score / top)))),
                "matchType": c.match_kind,
                "plant": plant_names.get(d.plant_id, ""),
                "date": d.created_at.date().isoformat(),
                "status": d.ingestion_status,
                "link": f"#documents/{d.id}",
            })
            if len(items) >= limit:
                break
        return items

    # ── equipment (trgm) ─────────────────────────────────────────────────────
    async def _equipment(self, query: str, limit: int) -> list[dict]:
        from app.modules.equipment.service import EquipmentService

        matches = await EquipmentService(self.session, self.tenant_id).resolve(query)
        if not matches:
            return []
        rows = {
            e.id: e for e in (await self.session.execute(
                select(Equipment).where(
                    Equipment.id.in_([uuid.UUID(str(m["id"])) for m in matches[:limit]])))).scalars()
        }
        plant_names = await self._plant_names()
        type_labels = {r.id: r.label for r in await self.lookups.by_category("equipment_types")}
        items = []
        for m in matches[:limit]:
            e = rows.get(uuid.UUID(str(m["id"])))
            if e is None:
                continue
            desc = f"{type_labels.get(e.type_id, 'Equipment')} · criticality {e.criticality}"
            items.append({
                "id": str(e.id), "title": f"{e.name} ({e.tag})", "type": "Equipment",
                "snippet": _highlight(f"{e.name}. {desc}. {e.manufacturer or ''} {e.model or ''}", query),
                "source": "Tag Registry", "relevance": int(round(float(m["score"]) * 100)),
                "matchType": "keyword", "plant": plant_names.get(e.plant_id, ""),
                "date": (e.install_date or e.created_at.date()).isoformat(),
                "status": e.status, "link": f"#equipment?tag={e.tag}",
            })
        return items

    # ── graph (Neo4j) ────────────────────────────────────────────────────────
    async def _graph(self, query: str, limit: int) -> list[dict]:
        try:
            nodes = await GraphQuery(self.tenant_id).search(query, None)
        except Exception as exc:  # noqa: BLE001 — graph optional
            log.warning("graph_search_skipped", error=str(exc))
            return []
        items = []
        for n in nodes[:limit]:
            props, label = n["properties"], (n["labels"][0] if n["labels"] else "Node")
            title = props.get("tag") or props.get("title") or props.get("name") or props.get("ref") or label
            items.append({
                "id": n["id"], "title": title, "type": "Graph",
                "snippet": f"{label} node in the knowledge graph",
                "source": "Knowledge Graph", "relevance": 70, "matchType": "semantic",
                "plant": "", "date": "", "status": "", "link": "#knowledge-graph",
            })
        return items

    # ── typeahead ────────────────────────────────────────────────────────────
    async def suggest(self, q: str, *, limit: int = 6) -> dict:
        q = (q or "").strip()
        docs = await self._suggest_documents(q, limit)
        equip = await self._suggest_equipment(q, limit)
        federated = await federated_registry.suggest(self.session, self.tenant_id, q, limit)
        actions = [a for a in CANNED_ACTIONS
                   if not q or q.lower() in a["name"].lower() or q.lower() in a["desc"].lower()]
        return {
            "Documents": docs,
            "Equipment": equip,
            "WorkOrders": federated.get("WorkOrders", []),
            "Regulations": federated.get("Regulations", []),
            "Actions": actions,
        }

    async def _suggest_documents(self, q: str, limit: int) -> list[dict]:
        stmt = select(Document).where(Document.tenant_id == self.tenant_id,
                                      Document.deleted_at.is_(None))
        if q:
            stmt = stmt.where(Document.title.ilike(f"%{q}%"))
        stmt = stmt.order_by(Document.created_at.desc()).limit(limit)
        rows = list((await self.session.execute(stmt)).scalars())
        type_labels = {r.id: r.label for r in await self.lookups.by_category("doc_types")}
        return [{"id": str(d.id), "name": d.title, "category": "Documents",
                 "desc": type_labels.get(d.doc_type_id) or "Document",
                 "route": f"#documents/{d.id}"} for d in rows]

    async def _suggest_equipment(self, q: str, limit: int) -> list[dict]:
        stmt = select(Equipment).where(Equipment.tenant_id == self.tenant_id,
                                       Equipment.deleted_at.is_(None))
        if q:
            stmt = stmt.where(or_(Equipment.tag.ilike(f"%{q}%"), Equipment.name.ilike(f"%{q}%")))
        stmt = stmt.order_by(Equipment.tag).limit(limit)
        rows = list((await self.session.execute(stmt)).scalars())
        return [{"id": e.tag, "name": f"{e.name} ({e.tag})", "category": "Equipment",
                 "desc": e.manufacturer or e.model or "Equipment",
                 "route": f"#equipment?tag={e.tag}"} for e in rows]

    async def _plant_names(self) -> dict[uuid.UUID, str]:
        rows = (await self.session.execute(
            select(Plant).where(Plant.tenant_id == self.tenant_id, Plant.deleted_at.is_(None)))).scalars()
        return {p.id: p.name for p in rows}


class SavedSearchService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def list(self, user_id: uuid.UUID) -> list:
        from app.modules.knowledge.models import SavedSearch

        stmt = (select(SavedSearch)
                .where(SavedSearch.tenant_id == self.tenant_id, SavedSearch.user_id == user_id,
                       SavedSearch.deleted_at.is_(None))
                .order_by(SavedSearch.created_at.desc()))
        return list((await self.session.execute(stmt)).scalars())

    async def create(self, *, user_id: uuid.UUID, name: str, query: str, filters: dict):
        from app.modules.audit.service import AuditService
        from app.modules.knowledge.models import SavedSearch

        row = SavedSearch(tenant_id=self.tenant_id, user_id=user_id, name=name, query=query,
                          filters=filters, created_by=user_id, updated_by=user_id)
        self.session.add(row)
        await self.session.flush()
        await AuditService(self.session).write(
            action="saved_search.create", entity_type="saved_search", entity_id=row.id,
            tenant_id=self.tenant_id, actor_id=user_id, after={"name": name, "query": query},
        )
        return row

    async def delete(self, *, user_id: uuid.UUID, saved_id: uuid.UUID) -> None:
        from sqlalchemy import func

        from app.core.exceptions import NotFound
        from app.modules.knowledge.models import SavedSearch

        row = (await self.session.execute(
            select(SavedSearch).where(SavedSearch.id == saved_id, SavedSearch.tenant_id == self.tenant_id,
                                      SavedSearch.user_id == user_id,
                                      SavedSearch.deleted_at.is_(None)))).scalar_one_or_none()
        if row is None:
            raise NotFound("Saved search not found", code="SAVED_SEARCH_NOT_FOUND")
        row.deleted_at = func.now()
        await self.session.flush()
        from app.modules.audit.service import AuditService

        await AuditService(self.session).write(
            action="saved_search.delete", entity_type="saved_search", entity_id=saved_id,
            tenant_id=self.tenant_id, actor_id=user_id,
        )
