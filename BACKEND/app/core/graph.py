"""Neo4j knowledge-graph driver + schema (docs/02 §9).

Thin async wrapper around the neo4j driver. Postgres is the source of truth; the
graph is a rebuildable projection. Every node carries `tenant_id`; queries always
filter on it (tenant isolation). Constraints/indexes per §9.
"""

from __future__ import annotations

from typing import Any

from neo4j import AsyncGraphDatabase

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("core.graph")

_driver = None

# Labels/edges the API is allowed to reference (docs/02 §26 — no raw Cypher from clients).
NODE_LABELS = {"Equipment", "Document", "Area", "Clause", "Regulation", "Person",
               "Parameter", "Material", "FailureMode", "FailureEvent", "WorkOrder",
               "Procedure", "Lesson", "Chunk"}
EDGE_TYPES = {"MENTIONS", "PART_OF", "LOCATED_IN", "OCCURRED_ON", "HAS_MODE",
              "PERFORMED_ON", "RESOLVED", "APPLIES_TO", "GOVERNS", "REFERENCES",
              "DERIVED_FROM", "PERFORMED", "MEASURED_ON"}


def get_driver():
    global _driver
    if _driver is None:
        _driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri, auth=(settings.neo4j_user, settings.neo4j_password))
    return _driver


async def close_driver() -> None:
    global _driver
    if _driver is not None:
        try:
            await _driver.close()
        except Exception:  # noqa: BLE001 — driver may be bound to a dead loop
            pass
        _driver = None


async def run_write(cypher: str, params: dict[str, Any] | None = None) -> list[dict]:
    async with get_driver().session() as session:
        result = await session.run(cypher, params or {})
        return [record.data() async for record in result]


async def run_read(cypher: str, params: dict[str, Any] | None = None) -> list[dict]:
    async with get_driver().session() as session:
        result = await session.run(cypher, params or {})
        return [record.data() async for record in result]


async def init_schema() -> None:
    """Idempotent constraints + indexes (docs/02 §9)."""
    statements = [
        "CREATE CONSTRAINT equipment_tenant_tag IF NOT EXISTS "
        "FOR (e:Equipment) REQUIRE (e.tenant_id, e.tag) IS UNIQUE",
        "CREATE CONSTRAINT document_pgid IF NOT EXISTS "
        "FOR (d:Document) REQUIRE d.pg_id IS UNIQUE",
        "CREATE CONSTRAINT area_pgid IF NOT EXISTS "
        "FOR (a:Area) REQUIRE a.pg_id IS UNIQUE",
        "CREATE INDEX equipment_tenant IF NOT EXISTS FOR (e:Equipment) ON (e.tenant_id)",
        "CREATE INDEX document_tenant IF NOT EXISTS FOR (d:Document) ON (d.tenant_id)",
        "CREATE INDEX clause_tenant_ref IF NOT EXISTS FOR (c:Clause) ON (c.tenant_id, c.ref)",
        "CREATE INDEX person_tenant_name IF NOT EXISTS FOR (p:Person) ON (p.tenant_id, p.name)",
        "CREATE INDEX parameter_tenant_name IF NOT EXISTS FOR (p:Parameter) ON (p.tenant_id, p.name)",
        "CREATE FULLTEXT INDEX equipment_fts IF NOT EXISTS "
        "FOR (e:Equipment) ON EACH [e.tag, e.name]",
        "CREATE FULLTEXT INDEX document_fts IF NOT EXISTS "
        "FOR (d:Document) ON EACH [d.title]",
    ]
    for stmt in statements:
        try:
            await run_write(stmt)
        except Exception as exc:  # noqa: BLE001 — constraint may already exist / edition limits
            log.warning("graph_schema_stmt_failed", stmt=stmt[:60], error=str(exc))


async def ping() -> bool:
    await get_driver().verify_connectivity()
    return True
