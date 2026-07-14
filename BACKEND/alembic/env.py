"""Alembic environment — wired to the async engine (docs/02 §5).

DB URL comes from app settings (DATABASE_URL). `target_metadata` is the shared
declarative Base metadata; module models import into it as they land, so
autogenerate sees the whole schema. pgvector types are registered for autogen.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy.pool import NullPool

from app.common.base import Base
from app.core.config import settings

# Import model modules here so their tables register on Base.metadata before
# autogenerate runs.
from app.modules.ai import models as _ai  # noqa: E402,F401
from app.modules.analytics import models as _analytics  # noqa: E402,F401
from app.modules.audit import models as _audit  # noqa: E402,F401
from app.modules.auth import models as _auth  # noqa: E402,F401
from app.modules.compliance import models as _compliance  # noqa: E402,F401
from app.modules.dashboards import models as _dashboards  # noqa: E402,F401
from app.modules.documents import models as _documents  # noqa: E402,F401
from app.modules.equipment import models as _equipment  # noqa: E402,F401
from app.modules.ingestion import models as _ingestion  # noqa: E402,F401
from app.modules.knowledge import models as _knowledge  # noqa: E402,F401
from app.modules.lessons import models as _lessons  # noqa: E402,F401
from app.modules.lookups import models as _lookups  # noqa: E402,F401
from app.modules.maintenance import models as _maintenance  # noqa: E402,F401
from app.modules.notifications import models as _notifications  # noqa: E402,F401
from app.modules.quality import models as _quality  # noqa: E402,F401
from app.modules.tenants import models as _tenants  # noqa: E402,F401
from app.modules.users import models as _users  # noqa: E402,F401

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _include_object(obj, name, type_, reflected, compare_to) -> bool:
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_object=_include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def _do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        include_object=_include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = settings.database_url
    connectable = async_engine_from_config(section, prefix="sqlalchemy.", poolclass=NullPool)
    async with connectable.connect() as connection:
        await connection.run_sync(_do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
