"""Baseline seed entrypoint (docs/02 §55 M1).

Seeds tenant, roles, permissions, lookups, prompt_templates, ai_model_configs
and demo users once the identity + config modules land. Scaffold ships the
runnable entrypoint (`make seed`) so the wiring exists from day one.
"""

from __future__ import annotations

import asyncio

from app.core.logging import configure_logging, get_logger

log = get_logger("seeds")


async def run() -> None:
    log.info("seed_start")
    # Populated as modules land: tenants → permissions → roles → users →
    # lookups → prompt_templates → ai_model_configs → dashboard_configs.
    log.info("seed_done", note="no data yet — scaffold entrypoint")


if __name__ == "__main__":
    configure_logging("INFO")
    asyncio.run(run())
