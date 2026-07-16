"""Extraction rule loading, caching and safe evaluation (docs/05 S7).

The rules that drive entity extraction are tenant data, not code. This module is
the only thing that reads them: it loads the active set per tenant (Redis-cached,
busted on any write), applies the `regex`/`keyword` methods, and hands the `llm`
rules' hints to the prompt builder.

**Untrusted patterns.** An admin can save any regex, and a pathological one
(nested quantifiers over a long chunk) backtracks effectively forever. This
module therefore uses `regex`, not the stdlib `re`: `regex` enforces a `timeout`
*inside* its matching loop.

That distinction is load-bearing, so don't "simplify" it back to `re`. `re` holds
the GIL for the whole match and cannot be interrupted, so the obvious guard —
`asyncio.wait_for(asyncio.to_thread(...))` — cannot work: the event loop never
gets to run, the timeout never fires, and the runaway match then wedges
interpreter shutdown, because concurrent.futures joins its worker threads at
exit. `regex` also resists several classic backtracking blowups outright; the
timeout is the backstop for the ones it doesn't.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import asdict, dataclass

import regex
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.redis import get_redis
from app.modules.ingestion.models import ExtractionRule

log = get_logger("ingestion.rules")

_CACHE_TTL = 300  # 5 min; writes bust explicitly, so this is only a backstop.
# Budget for a single pattern against a single chunk. Generous for any sane
# regex; a catastrophic backtracker blows straight through it.
MATCH_TIMEOUT_S = 2.0
# Guards the /test endpoint so an admin can't paste a novel as sample text.
MAX_SAMPLE_CHARS = 20_000


def _cache_key(tenant_id: uuid.UUID | str | None) -> str:
    return f"tenant:{tenant_id}:extraction_rules"


@dataclass(slots=True)
class LoadedRule:
    """A rule flattened for matching — deliberately not the ORM object, so the
    cached form is plain JSON and the hot path never touches the DB."""

    id: str
    entity_type: str
    method: str
    pattern: str | None
    llm_hint: str | None
    priority: int
    confidence: float
    version: int


@dataclass(slots=True)
class RuleMatch:
    entity_type: str
    value: str
    confidence: float
    rule_id: str | None
    rule_version: int | None
    start: int | None = None
    end: int | None = None


class InvalidPattern(ValueError):
    """A rule's pattern could not be compiled or ran out of time."""


# ── loading ──────────────────────────────────────────────────────────────────
async def load_rules(session: AsyncSession, tenant_id: uuid.UUID | str | None) -> list[LoadedRule]:
    """Active rules for a tenant, priority order. Cached in Redis; `bust` clears."""
    redis = get_redis()
    key = _cache_key(tenant_id)
    try:
        cached = await redis.get(key)
        if cached is not None:
            return [LoadedRule(**r) for r in json.loads(cached)]
    except Exception as exc:  # noqa: BLE001 — cache is an optimisation, never a dependency
        log.warning("rule_cache_read_failed", error=str(exc))

    stmt = (
        select(ExtractionRule)
        .where(ExtractionRule.tenant_id == tenant_id, ExtractionRule.is_active.is_(True))
        .order_by(ExtractionRule.priority.asc(), ExtractionRule.created_at.asc())
    )
    rows = (await session.execute(stmt)).scalars().all()
    rules = [
        LoadedRule(id=str(r.id), entity_type=r.entity_type, method=r.method, pattern=r.pattern,
                   llm_hint=r.llm_hint, priority=r.priority, confidence=float(r.confidence),
                   version=int(r.version))
        for r in rows
    ]
    try:
        # dataclasses.asdict, not __dict__: LoadedRule is slots=True and has no
        # __dict__, so the plain attribute access silently failed every write and
        # the cache never populated.
        await redis.set(key, json.dumps([asdict(r) for r in rules]), ex=_CACHE_TTL)
    except Exception as exc:  # noqa: BLE001
        log.warning("rule_cache_write_failed", error=str(exc))
    return rules


async def bust_cache(tenant_id: uuid.UUID | str | None) -> None:
    """Drop a tenant's cached rules. Call after any rule write."""
    try:
        await get_redis().delete(_cache_key(tenant_id))
    except Exception as exc:  # noqa: BLE001
        log.warning("rule_cache_bust_failed", error=str(exc))


# ── safe evaluation ──────────────────────────────────────────────────────────
def compile_pattern(pattern: str):
    """Compile with no implicit flags — a rule that wants case-insensitivity says
    so with an inline `(?i)`, which is visible in the editor and survives the
    round-trip through the DB. Inferring flags from the pattern's own casing would
    make two visually similar rules behave differently for no stated reason."""
    try:
        return regex.compile(pattern)
    except regex.error as exc:
        raise InvalidPattern(f"invalid regex: {exc}") from exc


def _finditer_blocking(rx, text: str) -> list:
    """`finditer` under a real, in-loop wall-clock cap (see the module docstring)."""
    try:
        return list(rx.finditer(text, timeout=MATCH_TIMEOUT_S))
    except TimeoutError as exc:
        raise InvalidPattern(
            f"pattern exceeded {MATCH_TIMEOUT_S}s on {len(text)} chars — likely catastrophic "
            "backtracking; simplify nested quantifiers") from exc


async def _finditer(rx, text: str) -> list:
    """Off-thread so a slow pattern doesn't stall the event loop for the whole
    timeout. Safe to hand to a thread precisely because `regex`'s timeout bounds
    it — the thread is guaranteed to end, which is not true of stdlib `re`."""
    return await asyncio.to_thread(_finditer_blocking, rx, text)


def _keywords(pattern: str) -> list[str]:
    """A keyword rule's pattern is a comma/newline-separated literal gazetteer."""
    return [k.strip() for k in regex.split(r"[,\n]", pattern or "") if k.strip()]


async def apply_rule(rule: LoadedRule, text: str) -> list[RuleMatch]:
    """Matches for one rule against one text. `llm` rules never match here."""
    if rule.method == "llm" or not rule.pattern:
        return []
    out: list[RuleMatch] = []
    if rule.method == "regex":
        rx = compile_pattern(rule.pattern)
        for m in await _finditer(rx, text):
            # Prefer the first capturing group when present: it lets a rule match
            # surrounding context but capture only the entity.
            value = next((g for g in m.groups() if g), None) or m.group(0)
            out.append(RuleMatch(entity_type=rule.entity_type, value=value,
                                 confidence=rule.confidence, rule_id=rule.id,
                                 rule_version=rule.version, start=m.start(), end=m.end()))
    elif rule.method == "keyword":
        lowered = text.lower()
        for kw in _keywords(rule.pattern):
            start = lowered.find(kw.lower())
            while start != -1:
                out.append(RuleMatch(entity_type=rule.entity_type, value=text[start:start + len(kw)],
                                     confidence=rule.confidence, rule_id=rule.id,
                                     rule_version=rule.version, start=start, end=start + len(kw)))
                start = lowered.find(kw.lower(), start + len(kw))
    return out


async def test_pattern(method: str, pattern: str, sample_text: str,
                       entity_type: str = "test", confidence: float = 1.0) -> list[RuleMatch]:
    """Back the admin `POST /admin/extraction-rules/test` preview.

    Raises `InvalidPattern` for an uncompilable or runaway pattern so the endpoint
    can turn it into a 422 the editor renders inline.
    """
    if len(sample_text) > MAX_SAMPLE_CHARS:
        raise InvalidPattern(f"sample_text exceeds {MAX_SAMPLE_CHARS} chars")
    rule = LoadedRule(id="", entity_type=entity_type, method=method, pattern=pattern,
                      llm_hint=None, priority=0, confidence=confidence, version=0)
    matches = await apply_rule(rule, sample_text)
    for m in matches:  # a preview has no persisted rule to attribute to
        m.rule_id = None
        m.rule_version = None
    return matches
