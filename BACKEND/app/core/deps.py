"""Shared FastAPI dependencies (docs/02 §3, §6).

The DB session dependency lives here today. Auth/tenant/RBAC dependencies
(`get_current_user`, `require(permission)`, tenant context) are added with the
auth module; their import points are reserved here so routers can depend on a
stable location.
"""

from __future__ import annotations

from app.core.database import get_session  # re-exported for routers

__all__ = ["get_session"]
