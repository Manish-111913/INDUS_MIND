"""Shared building blocks: declarative base, mixins, pagination, base repo, envelopes."""

from app.common.base import (
    AuditFieldsMixin,
    Base,
    SoftDeleteMixin,
    TenantMixin,
    VersionMixin,
)
from app.common.pagination import PageParams, PageResult, paginate
from app.common.repository import BaseRepository
from app.common.responses import error_envelope, success

__all__ = [
    "Base",
    "TenantMixin",
    "AuditFieldsMixin",
    "SoftDeleteMixin",
    "VersionMixin",
    "PageParams",
    "PageResult",
    "paginate",
    "BaseRepository",
    "success",
    "error_envelope",
]
