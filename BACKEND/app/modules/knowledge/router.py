"""Knowledge-graph HTTP router (docs/02 §26).

Reads require `graph.read`; rebuild is admin (`tenant.manage`). The query
endpoint takes a constrained pattern DSL — node/edge types are whitelist-checked
in the service; clients never send raw Cypher.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.modules.auth.dependencies import CurrentUser, require
from app.modules.knowledge.schemas import GraphQueryRequest
from app.modules.knowledge.service import GraphProjector, GraphQuery

router = APIRouter(prefix="/graph", tags=["knowledge"])


def _types(types: str | None) -> list[str] | None:
    return [t.strip() for t in types.split(",") if t.strip()] if types else None


@router.get("/search", summary="Search graph nodes")
async def graph_search(q: str = Query(..., min_length=1), types: str | None = Query(None),
                       actor: CurrentUser = Depends(require("graph.read"))) -> dict:
    results = await GraphQuery(actor.tenant_id).search(q, _types(types))
    return success(results)


@router.get("/stats", summary="Node/edge counts by type")
async def graph_stats(actor: CurrentUser = Depends(require("graph.read"))) -> dict:
    return success(await GraphQuery(actor.tenant_id).stats())


@router.post("/query", summary="Constrained pattern query (whitelist-validated DSL)")
async def graph_query(body: GraphQueryRequest,
                      actor: CurrentUser = Depends(require("graph.read"))) -> dict:
    results = await GraphQuery(actor.tenant_id).query_dsl(
        start_type=body.start_type, start_key=body.start_key, edge_types=body.edge_types,
        node_types=body.node_types, depth=body.depth)
    return success(results)


@router.post("/rebuild", summary="Rebuild the graph from Postgres (admin)")
async def graph_rebuild(actor: CurrentUser = Depends(require("tenant.manage")),
                        session: AsyncSession = Depends(get_session)) -> dict:
    stats = await GraphProjector(session, actor.tenant_id).rebuild()
    return success(stats)


@router.get("/nodes/{node_id}", summary="Node properties + edges")
async def graph_node(node_id: str, actor: CurrentUser = Depends(require("graph.read"))) -> dict:
    return success(await GraphQuery(actor.tenant_id).node(node_id))


@router.get("/nodes/{node_id}/neighbors", summary="Neighbors up to depth")
async def graph_neighbors(node_id: str, depth: int = Query(1, ge=1, le=3),
                          types: str | None = Query(None),
                          actor: CurrentUser = Depends(require("graph.read"))) -> dict:
    results = await GraphQuery(actor.tenant_id).neighbors(node_id, depth=depth, types=_types(types))
    return success(results)
