"""Compliance module events → knowledge-graph projection (docs/02 §9, §10, §34).

Postgres stays the source of truth; the graph is a rebuildable projection. On
regulation import we MERGE the Regulation + its Clause nodes; when the mapping
agent links or gaps a clause against equipment we MERGE the governance edge:
  · Regulation -[:HAS_CLAUSE]-> Clause
  · Clause -[:GOVERNS]-> Equipment      (equipment the clause regulates)
  · Clause -[:GOVERNS]-> Document        (the procedure that satisfies it)
Graph writes are best-effort — a graph outage must never fail a scan or import
(handlers swallow and log). Importing this module registers the subscribers.
"""

from __future__ import annotations

from app.core import graph
from app.core.events import Event, EventType, bus
from app.core.logging import get_logger

log = get_logger("compliance.events")


async def project_regulation(tenant_id, regulation, clauses) -> None:
    """MERGE the Regulation node + its Clause nodes (called on import)."""
    try:
        await graph.init_schema()
        await graph.run_write(
            "MERGE (r:Regulation {pg_id:$rid}) SET r.tenant_id=$tenant, r.code=$code, r.title=$title",
            {"rid": str(regulation.id), "tenant": str(tenant_id), "code": regulation.code,
             "title": regulation.title})
        for c in clauses:
            await graph.run_write(
                "MATCH (r:Regulation {pg_id:$rid}) "
                "MERGE (c:Clause {pg_id:$cid}) "
                "SET c.tenant_id=$tenant, c.ref=$ref, c.title=$title "
                "MERGE (r)-[:HAS_CLAUSE]->(c)",
                {"rid": str(regulation.id), "cid": str(c.id), "tenant": str(tenant_id),
                 "ref": c.clause_no, "title": c.title or ""})
    except Exception as exc:  # noqa: BLE001 — graph is optional; never fail the import
        log.warning("graph_regulation_project_failed", regulation_id=str(regulation.id), error=str(exc))


async def project_clause_governs(tenant_id, clause_id, clause_ref, *, equipment_id=None,
                                 document_id=None) -> None:
    """MERGE a Clause -[:GOVERNS]-> Equipment/Document governance edge."""
    try:
        await graph.init_schema()
        await graph.run_write(
            "MERGE (c:Clause {pg_id:$cid}) SET c.tenant_id=$tenant, c.ref=$ref",
            {"cid": str(clause_id), "tenant": str(tenant_id), "ref": clause_ref})
        if equipment_id:
            await graph.run_write(
                "MATCH (c:Clause {pg_id:$cid}), (e:Equipment {pg_id:$eq}) "
                "MERGE (c)-[:GOVERNS]->(e)",
                {"cid": str(clause_id), "eq": str(equipment_id)})
        if document_id:
            await graph.run_write(
                "MATCH (c:Clause {pg_id:$cid}), (d:Document {pg_id:$doc}) "
                "MERGE (c)-[:GOVERNS]->(d)",
                {"cid": str(clause_id), "doc": str(document_id)})
    except Exception as exc:  # noqa: BLE001
        log.warning("graph_clause_governs_failed", clause_id=str(clause_id), error=str(exc))


async def _project_gap_detected(event: Event) -> None:
    payload = event.payload or {}
    clause_id = payload.get("clause_id")
    equipment_id = payload.get("equipment_id")
    if not (event.tenant_id and clause_id and equipment_id):
        return
    await project_clause_governs(event.tenant_id, clause_id, payload.get("clause_no", ""),
                                 equipment_id=equipment_id)


bus.subscribe(EventType.GAP_DETECTED, _project_gap_detected)
