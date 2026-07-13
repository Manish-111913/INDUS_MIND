"""Rebuild the Neo4j projection from Postgres (docs/02 §9, §33 `rebuild_graph`).

Postgres is the source of truth; the graph is a rebuildable projection — this is
also the graph disaster-recovery answer. Full replay lands with the knowledge
module; scaffold ships the runnable entrypoint (`make rebuild-graph`).
"""

from __future__ import annotations

import asyncio

from app.core.logging import configure_logging, get_logger

log = get_logger("seeds.rebuild_graph")


async def run() -> None:
    log.info("rebuild_graph_start")
    log.info("rebuild_graph_done", note="no projection yet — scaffold entrypoint")


if __name__ == "__main__":
    configure_logging("INFO")
    asyncio.run(run())
