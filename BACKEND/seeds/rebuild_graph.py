"""Rebuild the Neo4j projection from Postgres (docs/02 §9, §33 `rebuild_graph`).

Postgres is the source of truth; the graph is a rebuildable projection — this is
also the graph disaster-recovery answer (`make rebuild-graph`). Replays every
tenant's equipment hierarchy + document entity mentions.
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.core.logging import configure_logging, get_logger

log = get_logger("seeds.rebuild_graph")


async def run() -> None:
    from app.core.database import SessionFactory
    from app.modules.knowledge.service import GraphProjector
    from app.modules.tenants.models import Tenant

    log.info("rebuild_graph_start")
    async with SessionFactory() as session:
        tenants = list((await session.execute(select(Tenant))).scalars())
        for tenant in tenants:
            stats = await GraphProjector(session, tenant.id).rebuild()
            log.info("rebuilt_tenant", tenant=tenant.slug, nodes=stats["total_nodes"],
                     edges=stats["total_edges"])
    log.info("rebuild_graph_done", tenants=len(tenants))
    print(f"Rebuilt graph for {len(tenants)} tenant(s).")


if __name__ == "__main__":
    configure_logging("INFO")
    asyncio.run(run())
