"""B18 / docs-05 S7 — extraction rules engine, admin CRUD, and the de-hardcoding.

The headline test is `test_no_regex_literals_left_in_extraction_module`: the whole
point of S7 is that patterns are tenant data, so a regex literal reappearing in
`extraction.py` is a regression even if every other test passes.
"""

from __future__ import annotations

import re
import time
from pathlib import Path

import httpx
import pytest
from sqlalchemy import select

from app.core.database import SessionFactory
from app.modules.tenants.models import Tenant
from seeds.seed import DEMO_PASSWORD
from seeds.seed import run as seed_run

_EXTRACTION_PY = Path(__file__).resolve().parents[1] / "app" / "modules" / "ingestion" / "extraction.py"


async def _admin_token(client: httpx.AsyncClient) -> str:
    r = await client.post("/api/v1/auth/login",
                          json={"email": "admin@indusmind.io", "password": DEMO_PASSWORD})
    return r.json()["data"]["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── the de-hardcoding guarantee ───────────────────────────────────────────────
def test_no_regex_literals_left_in_extraction_module():
    """S7's actual requirement: no extraction pattern may live in Python.

    Asserts on the source text rather than behaviour because that is the property
    being protected — someone re-adding `_TAG = re.compile(...)` for a "quick fix"
    would keep every behavioural test green while silently reintroducing the
    hardcoding S7 exists to remove.
    """
    source = _EXTRACTION_PY.read_text(encoding="utf-8")
    # Strip docstrings/comments: prose may legitimately mention a pattern.
    code = re.sub(r'"""(?:.|\n)*?"""', "", source)
    code = re.sub(r"#.*$", "", code, flags=re.MULTILINE)

    assert "re.compile(" not in code, "extraction.py must not compile patterns — rules come from the DB"
    assert not re.search(r"^\s*import re\b", code, flags=re.MULTILINE), \
        "extraction.py should not need the `re` module at all any more"
    # The old literals, verbatim — each must be gone.
    for literal in (r"\b[A-Z]{1,4}", "OISD-STD", r"\d{4}-\d{2}-\d{2}", "barg?", "mm/s"):
        assert literal not in code, f"hardcoded pattern fragment {literal!r} still in extraction.py"


def test_default_rules_reproduce_the_deleted_literals():
    """The seed catalog must carry the patterns extraction.py used to hardcode —
    otherwise the refactor silently drops entity types."""
    from app.modules.ingestion.rules_catalog import DEFAULT_EXTRACTION_RULES

    by_type = {r[0]: r for r in DEFAULT_EXTRACTION_RULES}
    assert {"equipment_tag", "regulation_ref", "date", "person", "parameter"} <= set(by_type)
    # Confidences must match the pre-refactor values (extraction.py's old `add(...)` calls).
    assert by_type["date"][5] == 0.900
    assert by_type["regulation_ref"][5] == 0.800
    assert by_type["parameter"][5] == 0.700
    assert by_type["equipment_tag"][5] == 0.550
    assert by_type["person"][5] == 0.500
    # Rules are applied in priority order; every default must have a distinct slot.
    priorities = [r[4] for r in DEFAULT_EXTRACTION_RULES]
    assert len(priorities) == len(set(priorities))


# ── engine ───────────────────────────────────────────────────────────────────
async def test_regex_rule_returns_match_spans():
    from app.modules.ingestion.rules_engine import test_pattern

    matches = await test_pattern("regex", r"\b[A-Z]-\d{3}\b", "Pump P-101 feeds P-102 downstream.")
    assert [m.value for m in matches] == ["P-101", "P-102"]
    assert (matches[0].start, matches[0].end) == (5, 10)


async def test_regex_rule_prefers_first_capturing_group():
    """A rule matches context but captures the entity — here the clause number is
    context and the standard is the entity."""
    from app.modules.ingestion.rules_engine import test_pattern

    matches = await test_pattern("regex", r"per (OISD-STD-\d+)", "Tested per OISD-STD-142 annually.")
    assert [m.value for m in matches] == ["OISD-STD-142"]


async def test_keyword_rule_finds_every_occurrence_case_insensitively():
    from app.modules.ingestion.rules_engine import test_pattern

    matches = await test_pattern("keyword", "seal leak, cavitation",
                                 "Seal leak found. Later a seal leak plus cavitation.")
    assert [m.value for m in matches] == ["Seal leak", "seal leak", "cavitation"]


async def test_llm_rule_never_matches_text():
    """`llm` rules feed the prompt; they must not be evaluated as patterns."""
    from app.modules.ingestion.rules_engine import LoadedRule, apply_rule

    rule = LoadedRule(id="x", entity_type="failure_mode", method="llm", pattern=None,
                      llm_hint="find failure modes", priority=1, confidence=0.6, version=1)
    assert await apply_rule(rule, "a bearing seized") == []


async def test_invalid_pattern_is_rejected_not_raised_raw():
    from app.modules.ingestion.rules_engine import InvalidPattern, test_pattern

    with pytest.raises(InvalidPattern):
        await test_pattern("regex", "(unclosed", "text")


async def test_catastrophic_backtracking_times_out_instead_of_hanging():
    """An admin can save any regex; a runaway one must surface as an error rather
    than wedge the request.

    `(a|aa)+$` against a non-matching string is chosen deliberately: it is one of
    the blowups the `regex` engine does *not* optimise away, so it actually
    exercises the timeout. (Several textbook backtrackers — `(a+)+$`, `(x+x+)+y` —
    complete instantly under `regex` and would make this test vacuous.)
    """
    from app.modules.ingestion.rules_engine import MATCH_TIMEOUT_S, InvalidPattern, test_pattern

    started = time.monotonic()
    with pytest.raises(InvalidPattern, match="exceeded"):
        await test_pattern("regex", r"(a|aa)+$", "a" * 40 + "b")
    elapsed = time.monotonic() - started
    # Bounded by the timeout rather than running to completion (which would be
    # ~2**40 steps). The upper bound is what proves it was cut short.
    assert elapsed < MATCH_TIMEOUT_S * 3, f"timeout did not bound the match ({elapsed:.1f}s)"


async def test_llm_hints_are_appended_to_the_system_prompt():
    from app.modules.ingestion.extraction import _system_with_hints
    from app.modules.ingestion.rules_engine import LoadedRule

    rules = [
        LoadedRule(id="1", entity_type="failure_mode", method="llm", pattern=None,
                   llm_hint="find seal leaks", priority=1, confidence=0.6, version=1),
        LoadedRule(id="2", entity_type="equipment_tag", method="regex", pattern="x",
                   llm_hint=None, priority=2, confidence=0.5, version=1),
    ]
    prompt = _system_with_hints(rules)
    assert "find seal leaks" in prompt
    # A regex rule contributes no hint.
    assert prompt.count("- ") == 1
    # No llm rules at all → the base prompt, with no dangling header.
    assert "guidance" not in _system_with_hints([rules[1]])


# ── admin CRUD ───────────────────────────────────────────────────────────────
async def test_seeded_rules_are_listed_in_priority_order(db, client):
    await seed_run()
    token = await _admin_token(client)
    r = await client.get("/api/v1/admin/extraction-rules", headers=_auth(token))
    assert r.status_code == 200
    rules = r.json()["data"]
    assert len(rules) >= 5
    assert [x["priority"] for x in rules] == sorted(x["priority"] for x in rules)


async def test_update_bumps_version_so_entities_can_be_attributed(db, client):
    await seed_run()
    token = await _admin_token(client)
    rules = (await client.get("/api/v1/admin/extraction-rules", headers=_auth(token))).json()["data"]
    rule = next(x for x in rules if x["method"] == "regex")
    before = rule["version"]

    r = await client.patch(f"/api/v1/admin/extraction-rules/{rule['id']}",
                           json={"confidence": 0.42}, headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["data"]["version"] == before + 1
    assert r.json()["data"]["confidence"] == 0.42


async def test_create_rejects_uncompilable_regex_at_write_time(db, client):
    """An active rule that throws would be skipped on every document — catch it
    when it is saved, not when ingestion quietly drops entities."""
    await seed_run()
    token = await _admin_token(client)
    r = await client.post("/api/v1/admin/extraction-rules",
                          json={"entity_type": "equipment_tag", "method": "regex",
                                "pattern": "(unclosed"},
                          headers=_auth(token))
    assert r.status_code == 422


async def test_create_rejects_method_without_its_required_field(db, client):
    await seed_run()
    token = await _admin_token(client)
    for body in ({"entity_type": "date", "method": "regex"},
                 {"entity_type": "date", "method": "llm"}):
        r = await client.post("/api/v1/admin/extraction-rules", json=body, headers=_auth(token))
        assert r.status_code == 422, body


async def test_patch_to_regex_without_pattern_is_rejected(db, client):
    """The pairing rule must be re-checked against the merged row — a PATCH can
    break an invariant a partial body cannot see on its own."""
    await seed_run()
    token = await _admin_token(client)
    created = (await client.post("/api/v1/admin/extraction-rules",
                                 json={"entity_type": "failure_mode", "method": "llm",
                                       "llm_hint": "hint"}, headers=_auth(token))).json()["data"]

    r = await client.patch(f"/api/v1/admin/extraction-rules/{created['id']}",
                           json={"method": "regex"}, headers=_auth(token))
    assert r.status_code == 422


async def test_test_endpoint_returns_spans_for_the_editor_preview(db, client):
    await seed_run()
    token = await _admin_token(client)
    r = await client.post("/api/v1/admin/extraction-rules/test",
                          json={"method": "regex", "pattern": r"\bP-\d{3}\b",
                                "sample_text": "P-101 and P-102"},
                          headers=_auth(token))
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["match_count"] == 2
    assert data["matches"][0] == {"value": "P-101", "start": 0, "end": 5, "confidence": 1.0}


async def test_test_endpoint_turns_a_bad_pattern_into_422(db, client):
    await seed_run()
    token = await _admin_token(client)
    r = await client.post("/api/v1/admin/extraction-rules/test",
                          json={"method": "regex", "pattern": "(unclosed", "sample_text": "x"},
                          headers=_auth(token))
    assert r.status_code == 422


async def test_rules_require_the_permission(db, client):
    """Technician has no extraction_rules.manage — the whole surface must 403."""
    await seed_run()
    r = await client.post("/api/v1/auth/login",
                          json={"email": "technician@indusmind.io", "password": DEMO_PASSWORD})
    token = r.json()["data"]["access_token"]
    assert (await client.get("/api/v1/admin/extraction-rules",
                             headers=_auth(token))).status_code == 403
    assert (await client.post("/api/v1/admin/extraction-rules/test",
                              json={"method": "regex", "pattern": "a", "sample_text": "a"},
                              headers=_auth(token))).status_code == 403


async def test_cache_is_busted_on_write(db, client):
    """The worker reads rules from Redis; a stale cache would keep applying the
    old set after an admin edit."""
    await seed_run()
    from app.modules.ingestion.rules_engine import load_rules

    token = await _admin_token(client)
    async with SessionFactory() as s:
        tenant_id = (await s.execute(select(Tenant))).scalars().first().id
        before = len(await load_rules(s, tenant_id))  # populates the cache

    await client.post("/api/v1/admin/extraction-rules",
                      json={"entity_type": "material", "method": "keyword", "pattern": "SS316"},
                      headers=_auth(token))

    async with SessionFactory() as s:
        after = await load_rules(s, tenant_id)
    assert len(after) == before + 1, "rule cache was not busted on create"
