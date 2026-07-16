"""Default extraction-rule seed (docs/05 S7).

These are the patterns that used to be literals in `extraction.py`. They are
seeded per tenant (not global) because they are meant to be *edited* — a plant
with a different tag convention rewrites the equipment_tag rule rather than
patching Python.

The regex/keyword confidences intentionally reproduce the pre-refactor values, so
seeding this catalog leaves extraction behaving exactly as it did before the
rules engine landed. Changing one is a product decision, not a cleanup.

Priorities are spaced by 10 so a tenant can slot a rule between two defaults
without renumbering the set.
"""

from __future__ import annotations

# (entity_type, method, pattern, llm_hint, priority, confidence, description)
DEFAULT_EXTRACTION_RULES: list[tuple[str, str, str | None, str | None, int, float, str]] = [
    ("date", "regex", r"\b\d{4}-\d{2}-\d{2}\b", None, 10, 0.900,
     "ISO-8601 calendar dates (2026-07-16). Unambiguous, so the highest-confidence rule."),
    ("regulation_ref", "regex",
     r"\b(OISD-STD-\d+|OISD-\d+|IS-\d+|SOP-\d+|Factory Act|PESO)\b(?:[\s,]*(?:clause\s*)?"
     r"(\d+(?:\.\d+)+))?",
     None, 20, 0.800,
     "Indian oil & gas / factory standards, with an optional trailing clause number."),
    ("parameter", "regex",
     r"\b\d+(?:\.\d+)?\s?(?:Nm|m3/h|barg?|kW|rpm|mm/s|ppm|tph|mmkcal|MVA|kV)\b",
     None, 30, 0.700,
     "A number followed by a plant engineering unit (12.5 bar, 1450 rpm)."),
    ("equipment_tag", "regex", r"\b[A-Z]{1,4}-?[A-Z]?-?\d{1,4}[A-Z]?\b", None, 40, 0.550,
     "Equipment tags: P-101, P101, C-3, TK-01, FUR-1, FW-P1. Deliberately broad and "
     "low-confidence — the equipment registry resolves and re-scores each hit, and an "
     "unresolved tag stays in 'auto' for human review."),
    ("person", "regex", r"\b[A-Z]\.\s?[A-Z][a-z]{2,}\b", None, 50, 0.500,
     "Initial-plus-surname sign-offs (R. Sharma). Low confidence: collides with "
     "abbreviations, so it is a review candidate rather than a fact."),
    # An `llm` rule contributes its hint to the extraction prompt instead of
    # matching text — this is how a tenant teaches the model its vocabulary.
    ("failure_mode", "llm", None,
     "Identify failure modes described in prose (seal leak, bearing seizure, cavitation, "
     "tube fouling) even when no standard code is written next to them.",
     60, 0.600, "LLM guidance for failure modes, which have no reliable surface pattern."),
    ("material", "llm", None,
     "Identify materials of construction and consumables (SS316, Viton, API 610 mechanical "
     "seal, grade of lube oil) mentioned in maintenance text.",
     70, 0.600, "LLM guidance for materials, which are vocabulary rather than pattern."),
]
