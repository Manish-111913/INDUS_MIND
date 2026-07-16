"""locales, translations, translation_gaps (docs/08 S9)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import Base


class Locale(Base):
    """A supported UI language. `code` is the natural PK ("en", "hi")."""

    __tablename__ = "locales"

    # Override the UUID pk from Base with the natural language code.
    id = None  # type: ignore[assignment]
    code: Mapped[str] = mapped_column(String(8), primary_key=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    native_name: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False)


class Translation(Base):
    __tablename__ = "translations"

    locale: Mapped[str] = mapped_column(
        String(8), ForeignKey("locales.code", ondelete="CASCADE"), nullable=False)
    namespace: Mapped[str] = mapped_column(String(48), nullable=False)
    key: Mapped[str] = mapped_column(String(128), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("locale", "namespace", "key", name="uq_translations_locale_ns_key"),
        Index("ix_translations_locale_ns", "locale", "namespace"),
    )


class TranslationGap(Base):
    """A requested key that had no translation — logged so admins can fill it."""

    __tablename__ = "translation_gaps"

    locale: Mapped[str] = mapped_column(String(8), nullable=False)
    namespace: Mapped[str] = mapped_column(String(48), nullable=False)
    key: Mapped[str] = mapped_column(String(128), nullable=False)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False)
    hits: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")

    __table_args__ = (
        UniqueConstraint("locale", "namespace", "key", name="uq_translation_gaps_locale_ns_key"),
    )
