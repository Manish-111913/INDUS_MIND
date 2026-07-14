"""Shared Pydantic base for request/input schemas (docs/02 §41 — Input Validation).

Every schema that is parsed from an inbound request body inherits ``StrictModel``:

  * ``extra="forbid"`` — unknown keys are rejected with a 422 instead of being
    silently dropped. A payload carrying stray fields (typo, a client sending a
    field the server doesn't expect, or an attacker probing for mass-assignment)
    fails loudly at the edge rather than being partially accepted.
  * ``str_strip_whitespace=True`` — leading/trailing whitespace is trimmed from
    string values before field validators run (length/pattern checks see the
    trimmed value).

Read/response models keep plain ``BaseModel`` + ``from_attributes=True`` so they
can be built from ORM objects; forbidding extras there would serve no purpose.

We deliberately do NOT enable Pydantic ``strict=True`` globally: request bodies
are JSON, and dropping all coercion (str→UUID, str→datetime, int→float, the
enum-from-string path the lookups use) would reject well-formed clients. The
security win the spec asks for is closing the "extra fields" hole, which
``extra="forbid"`` delivers without breaking legitimate payloads.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class StrictModel(BaseModel):
    """Base for all inbound request schemas. See module docstring."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
