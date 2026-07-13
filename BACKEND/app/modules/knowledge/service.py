"""Knowledge-graph projection + query (docs/02 §9, §10 step 7, §26).

Write side (`GraphProjector`) MERGEs nodes/edges from Postgres with tenant_id +
provenance. Read side (`GraphQuery`) powers the graph API — constrained, never
raw Cypher from clients. Postgres is source of truth; the graph is rebuildable.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import graph
from app.core.events import Event, EventType, bus
from app.core.exceptions import NotFound, ValidationFailed
from app.core.logging import get_logger
from app.modules.documents.models import Document
from app.modules.equipment.models import Area, Equipment
from app.modules.ingestion.models import ExtractedEntity

log = get_logger("knowledge.service")

_schema_ready = False


async def _ensure_schema() -> None:
    global _schema_ready
    if not _schema_ready:
        await graph.init_schema()
        _schema_ready = True


class GraphProjector:
    """Write side — needs a Postgres session to read the system of record."""

    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = str(tenant_id)

    async def upsert_document(self, document: Document,
                              entities: list[ExtractedEntity]) -> None:
        await _ensure_schema()
        await graph.run_write(
            "MERGE (d:Document {pg_id: $pg_id}) "
            "SET d.tenant_id=$tenant, d.title=$title, d.doc_type=$doc_type, "
            "d.source_document_ids=[$pg_id]",
            {"pg_id": str(document.id), "tenant": self.tenant_id, "title": document.title,
             "doc_type": str(document.doc_type_id) if document.doc_type_id else None})

        equip = [{"tag": e.normalized_value, "conf": float(e.confidence or 0), "page": e.page_no}
                 for e in entities if e.entity_type == "equipment_tag" and e.linked_record_id]
        if equip:
            await graph.run_write(
                "MATCH (d:Document {pg_id:$pg_id}) UNWIND $rows AS row "
                "MERGE (e:Equipment {tenant_id:$tenant, tag:row.tag}) "
                "MERGE (d)-[m:MENTIONS]->(e) SET m.confidence=row.conf, m.page=row.page",
                {"pg_id": str(document.id), "tenant": self.tenant_id, "rows": equip})

        await self._mention("Clause", "ref", [e for e in entities if e.entity_type == "regulation_ref"],
                            document.id)
        await self._mention("Person", "name", [e for e in entities if e.entity_type == "person"],
                            document.id)
        await self._mention("Parameter", "name", [e for e in entities if e.entity_type == "parameter"],
                            document.id)
        await bus.publish(Event(EventType.GRAPH_UPDATED, tenant_id=self.tenant_id,
                                payload={"document_id": str(document.id)}))

    async def _mention(self, label: str, prop: str, entities: list[ExtractedEntity],
                       document_id: uuid.UUID) -> None:
        rows = [{"val": e.normalized_value or e.value, "conf": float(e.confidence or 0),
                 "page": e.page_no} for e in entities if (e.normalized_value or e.value)]
        if not rows:
            return
        await graph.run_write(
            f"MATCH (d:Document {{pg_id:$pg_id}}) UNWIND $rows AS row "
            f"MERGE (n:{label} {{tenant_id:$tenant, {prop}:row.val}}) "
            f"MERGE (d)-[m:MENTIONS]->(n) SET m.confidence=row.conf, m.page=row.page",
            {"pg_id": str(document_id), "tenant": self.tenant_id, "rows": rows})

    async def project_equipment(self) -> None:
        await _ensure_schema()
        equipment = list((await self.session.execute(
            select(Equipment).where(Equipment.tenant_id == self.tenant_id,
                                    Equipment.deleted_at.is_(None)))).scalars())
        areas = list((await self.session.execute(
            select(Area).where(Area.tenant_id == self.tenant_id,
                               Area.deleted_at.is_(None)))).scalars())
        if areas:
            await graph.run_write(
                "UNWIND $rows AS a MERGE (n:Area {pg_id:a.id}) "
                "SET n.tenant_id=$tenant, n.name=a.name, n.code=a.code",
                {"tenant": self.tenant_id,
                 "rows": [{"id": str(a.id), "name": a.name, "code": a.code} for a in areas]})
        if equipment:
            await graph.run_write(
                "UNWIND $rows AS eq MERGE (e:Equipment {tenant_id:$tenant, tag:eq.tag}) "
                "SET e.pg_id=eq.id, e.name=eq.name, e.criticality=eq.criticality",
                {"tenant": self.tenant_id,
                 "rows": [{"id": str(e.id), "tag": e.tag, "name": e.name,
                           "criticality": e.criticality} for e in equipment]})
            # LOCATED_IN
            located = [{"id": str(e.id), "area": str(e.area_id)} for e in equipment if e.area_id]
            if located:
                await graph.run_write(
                    "UNWIND $rows AS r MATCH (e:Equipment {pg_id:r.id}), (a:Area {pg_id:r.area}) "
                    "MERGE (e)-[:LOCATED_IN]->(a)", {"rows": located})
            # PART_OF (parent by pg_id)
            parents = [{"id": str(e.id), "parent": str(e.parent_id)} for e in equipment if e.parent_id]
            if parents:
                await graph.run_write(
                    "UNWIND $rows AS r MATCH (c:Equipment {pg_id:r.id}), (p:Equipment {pg_id:r.parent}) "
                    "MERGE (c)-[:PART_OF]->(p)", {"rows": parents})

    async def rebuild(self) -> dict:
        await _ensure_schema()
        await graph.run_write("MATCH (n {tenant_id:$tenant}) DETACH DELETE n",
                              {"tenant": self.tenant_id})
        await self.project_equipment()
        documents = list((await self.session.execute(
            select(Document).where(Document.tenant_id == self.tenant_id,
                                   Document.deleted_at.is_(None)))).scalars())
        for doc in documents:
            entities = list((await self.session.execute(
                select(ExtractedEntity).where(ExtractedEntity.tenant_id == self.tenant_id,
                                              ExtractedEntity.document_id == doc.id))).scalars())
            await self.upsert_document(doc, entities)
        return await GraphQuery(self.tenant_id).stats()


class GraphQuery:
    """Read side — Neo4j only, tenant-scoped, whitelist-validated."""

    def __init__(self, tenant_id: uuid.UUID | str) -> None:
        self.tenant_id = str(tenant_id)

    async def search(self, q: str, types: list[str] | None = None) -> list[dict]:
        rows = await graph.run_read(
            "MATCH (n) WHERE n.tenant_id=$tenant AND ("
            "toLower(coalesce(n.tag,'')) CONTAINS toLower($q) OR "
            "toLower(coalesce(n.name,'')) CONTAINS toLower($q) OR "
            "toLower(coalesce(n.title,'')) CONTAINS toLower($q) OR "
            "toLower(coalesce(n.ref,'')) CONTAINS toLower($q)) "
            "RETURN elementId(n) AS id, labels(n) AS labels, properties(n) AS props LIMIT 25",
            {"tenant": self.tenant_id, "q": q})
        return [self._node(r) for r in rows if not types or set(r["labels"]) & set(types)]

    async def node(self, node_id: str) -> dict:
        rows = await graph.run_read(
            "MATCH (n) WHERE elementId(n)=$id AND n.tenant_id=$tenant "
            "OPTIONAL MATCH (n)-[r]-(m) WHERE m.tenant_id=$tenant "
            "RETURN elementId(n) AS id, labels(n) AS labels, properties(n) AS props, "
            "collect({type:type(r), node_id:elementId(m), labels:labels(m), "
            "props:properties(m)}) AS edges",
            {"id": node_id, "tenant": self.tenant_id})
        if not rows:
            raise NotFound("Graph node not found", code="NODE_NOT_FOUND")
        r = rows[0]
        node = self._node(r)
        node["edges"] = [e for e in r["edges"] if e.get("node_id")]
        return node

    async def neighbors(self, node_id: str, *, depth: int = 1,
                        types: list[str] | None = None) -> list[dict]:
        depth = max(1, min(depth, 3))  # validated int, safe to interpolate
        rows = await graph.run_read(
            f"MATCH (n) WHERE elementId(n)=$id AND n.tenant_id=$tenant "
            f"MATCH (n)-[*1..{depth}]-(m) WHERE m.tenant_id=$tenant "
            f"RETURN DISTINCT elementId(m) AS id, labels(m) AS labels, properties(m) AS props",
            {"id": node_id, "tenant": self.tenant_id})
        return [self._node(r) for r in rows if not types or set(r["labels"]) & set(types)]

    async def query_dsl(self, *, start_type: str, start_key: str | None,
                        edge_types: list[str], node_types: list[str], depth: int = 2) -> list[dict]:
        if start_type not in graph.NODE_LABELS:
            raise ValidationFailed(f"Unknown start_type '{start_type}'", code="VALIDATION_ERROR",
                                   http_status=422)
        bad_edges = set(edge_types) - graph.EDGE_TYPES
        bad_nodes = set(node_types) - graph.NODE_LABELS
        if bad_edges or bad_nodes:
            raise ValidationFailed(f"Unknown types: {sorted(bad_edges | bad_nodes)}",
                                   code="VALIDATION_ERROR", http_status=422)
        depth = max(1, min(depth, 3))
        rel = ":" + "|".join(edge_types) if edge_types else ""
        where_key = ("WHERE (s.tag=$key OR s.title=$key OR s.ref=$key OR s.name=$key) "
                     if start_key else "")
        cypher = (
            f"MATCH (s:{start_type} {{tenant_id:$tenant}}) {where_key}"
            f"MATCH (s)-[{rel}*1..{depth}]-(m) WHERE m.tenant_id=$tenant "
            f"RETURN DISTINCT elementId(m) AS id, labels(m) AS labels, properties(m) AS props LIMIT 100")
        rows = await graph.run_read(cypher, {"tenant": self.tenant_id, "key": start_key})
        return [self._node(r) for r in rows if not node_types or set(r["labels"]) & set(node_types)]

    async def stats(self) -> dict:
        nodes = await graph.run_read(
            "MATCH (n {tenant_id:$tenant}) RETURN labels(n)[0] AS label, count(*) AS count",
            {"tenant": self.tenant_id})
        edges = await graph.run_read(
            "MATCH (a {tenant_id:$tenant})-[r]->(b {tenant_id:$tenant}) "
            "RETURN type(r) AS type, count(*) AS count", {"tenant": self.tenant_id})
        return {
            "nodes_by_label": {r["label"]: r["count"] for r in nodes if r["label"]},
            "edges_by_type": {r["type"]: r["count"] for r in edges},
            "total_nodes": sum(r["count"] for r in nodes),
            "total_edges": sum(r["count"] for r in edges),
        }

    @staticmethod
    def _node(r: dict) -> dict:
        return {"id": r["id"], "labels": r["labels"], "properties": r["props"]}
