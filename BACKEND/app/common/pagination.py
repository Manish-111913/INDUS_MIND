"""Pagination + sort helper: `?page&page_size(≤100)&sort=-created_at` → SQLAlchemy.

docs/02 §13. Returns a PageResult whose `meta` slots into the success envelope's
`meta.pagination`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field
from sqlalchemy import Select, asc, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")

MAX_PAGE_SIZE = 100


class PageParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=MAX_PAGE_SIZE)
    sort: str | None = Field(default="-created_at")

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


@dataclass(slots=True)
class PageResult(Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int

    @property
    def pages(self) -> int:
        return (self.total + self.page_size - 1) // self.page_size if self.page_size else 0

    @property
    def meta(self) -> dict[str, Any]:
        return {
            "pagination": {
                "page": self.page,
                "page_size": self.page_size,
                "total": self.total,
                "pages": self.pages,
            }
        }


def apply_sort(stmt: Select, model: Any, sort: str | None) -> Select:
    """`sort=-created_at,name` → ORDER BY created_at DESC, name ASC (unknown cols skipped)."""
    if not sort:
        return stmt
    for field in (s.strip() for s in sort.split(",") if s.strip()):
        direction = desc if field.startswith("-") else asc
        col_name = field.lstrip("+-")
        col = getattr(model, col_name, None)
        if col is not None:
            stmt = stmt.order_by(direction(col))
    return stmt


async def paginate(
    session: AsyncSession, stmt: Select, params: PageParams, model: Any
) -> PageResult:
    total = await session.scalar(select(func.count()).select_from(stmt.subquery()))
    stmt = apply_sort(stmt, model, params.sort).limit(params.page_size).offset(params.offset)
    items = list((await session.execute(stmt)).scalars().all())
    return PageResult(items=items, total=total or 0, page=params.page, page_size=params.page_size)
