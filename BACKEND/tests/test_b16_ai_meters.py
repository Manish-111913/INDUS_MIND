"""B16 — AI feedback + usage metering + meter readings + predictor (docs/05 S4-S5).

Covers: adapter-layer usage row with correct cost math, usage summary aggregate +
RBAC, ai_feedback dual-write + reason_code validation + down-vote review,
reading record RBAC + server-side downsampling, and the predictor reacting to a
worsening reading trend. Runs against real Postgres/Redis (skips if unavailable).
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.database import SessionFactory
from app.modules.equipment.models import Equipment
from app.modules.tenants.models import Tenant
from seeds.seed import DEMO_PASSWORD
from seeds.seed import run as seed_run


async def _login(client, email: str) -> str:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _tenant_id() -> uuid.UUID:
    async with SessionFactory() as s:
        return (await s.execute(select(Tenant).where(Tenant.slug == "indusmind"))).scalar_one().id


async def _equipment_id(tag: str) -> uuid.UUID:
    async with SessionFactory() as s:
        return (await s.execute(select(Equipment).where(Equipment.tag == tag))).scalar_one().id


# ── S4 usage cost metering ─────────────────────────────────────────────────────
def test_compute_cost_usd():
    from app.core.llm import ResolvedConfig, compute_cost_usd

    cfg = ResolvedConfig(provider="anthropic", model_name="m",
                         price_input_usd=3.0, price_output_usd=15.0)
    # 100 prompt + 50 completion tokens at $3 / $15 per 1M.
    assert compute_cost_usd(cfg, 100, 50) == pytest.approx(100 / 1e6 * 3 + 50 / 1e6 * 15)


async def test_adapter_records_ai_usage_with_cost(db, client, monkeypatch):
    await seed_run()
    tenant_id = await _tenant_id()

    from app.core import llm
    from app.modules.ai.models import AIUsage

    class _Stub:
        name = "anthropic"

        def complete(self, messages, *, model, **params):
            return llm.LLMResponse(text="ok", model=model, prompt_tokens=100,
                                   completion_tokens=50, latency_ms=7)

    llm.clear_config_cache()
    monkeypatch.setattr(llm, "_provider_for", lambda cfg: _Stub())

    async with SessionFactory() as s:
        await llm.complete(s, tenant_id, "chat",
                           messages=[llm.LLMMessage(role="user", content="hi")])
        await s.commit()

    async with SessionFactory() as s:
        row = (await s.execute(select(AIUsage).where(AIUsage.feature == "chat")
                               .order_by(AIUsage.created_at.desc()))).scalars().first()
        assert row is not None
        assert row.prompt_tokens == 100 and row.completion_tokens == 50
        assert float(row.cost_usd) == pytest.approx(100 / 1e6 * 3 + 50 / 1e6 * 15)
        assert row.model_config_id is not None  # linked to the resolving config row


async def test_ai_usage_summary_endpoint_and_rbac(db, client):
    await seed_run()
    admin = await _login(client, "admin@indusmind.io")
    r = await client.get("/api/v1/admin/ai-usage/summary?group_by=feature", headers=_auth(admin))
    assert r.status_code == 200, r.text
    body = r.json()["data"]
    assert body["group_by"] == "feature"
    assert {"calls", "total_tokens", "cost_usd"} <= set(body["totals"].keys())

    # group_by=day works too
    r = await client.get("/api/v1/admin/ai-usage/summary?group_by=day", headers=_auth(admin))
    assert r.status_code == 200

    tech = await _login(client, "technician@indusmind.io")  # lacks ai.observability.view
    r = await client.get("/api/v1/admin/ai-usage/summary", headers=_auth(tech))
    assert r.status_code == 403


# ── S4 feedback ────────────────────────────────────────────────────────────────
async def _make_answer(client, token) -> tuple[str, str]:
    """Create a session, send a message, return (session_id, assistant_message_id)."""
    sess = await client.post("/api/v1/chat/sessions", headers=_auth(token), json={"title": "t"})
    session_id = sess.json()["data"]["id"]
    # consume the SSE stream so the assistant message is persisted
    async with client.stream("POST", f"/api/v1/chat/sessions/{session_id}/messages",
                             headers=_auth(token),
                             json={"content": "What is the firewater test interval?"}) as resp:
        assert resp.status_code == 200
        async for _ in resp.aiter_bytes():
            pass
    msgs = await client.get(f"/api/v1/chat/sessions/{session_id}/messages", headers=_auth(token))
    assistant = next(m for m in msgs.json()["data"] if m["role"] == "assistant")
    return session_id, assistant["id"]


async def test_ai_feedback_dualwrite_and_review(db, client):
    await seed_run()
    tech = await _login(client, "technician@indusmind.io")
    _session_id, msg_id = await _make_answer(client, tech)

    # invalid reason_code rejected
    bad = await client.post(f"/api/v1/chat/messages/{msg_id}/feedback", headers=_auth(tech),
                            json={"value": "down", "reason_code": "bogus"})
    assert bad.status_code == 400, bad.text

    # valid down-vote with a seeded reason_code
    ok = await client.post(f"/api/v1/chat/messages/{msg_id}/feedback", headers=_auth(tech),
                           json={"value": "down", "reason_code": "incorrect",
                                 "comment": "wrong interval"})
    assert ok.status_code == 200, ok.text

    # admin review lists the down-vote with the question text + session link
    admin = await _login(client, "admin@indusmind.io")
    r = await client.get("/api/v1/admin/ai-feedback?rating=down", headers=_auth(admin))
    assert r.status_code == 200, r.text
    rows = r.json()["data"]
    row = next(x for x in rows if x["message_id"] == msg_id)
    assert row["reason_code"] == "incorrect"
    assert "firewater" in (row["question"] or "").lower()
    assert row["session_link"].startswith("/chat/sessions/")


# ── S5 meters ──────────────────────────────────────────────────────────────────
async def test_reading_rbac_and_downsampling(db, client):
    await seed_run()
    p101 = await _equipment_id("P-101")

    # record RBAC: compliance officer lacks readings.record
    comp = await _login(client, "compliance@indusmind.io")
    denied = await client.post(f"/api/v1/equipment/{p101}/readings", headers=_auth(comp),
                               json={"meter_code": "vibration", "value": 3.1})
    assert denied.status_code == 403, denied.text

    # technician can record
    tech = await _login(client, "technician@indusmind.io")
    ok = await client.post(f"/api/v1/equipment/{p101}/readings", headers=_auth(tech),
                           json={"meter_code": "vibration", "value": 3.1})
    assert ok.status_code == 201, ok.text

    # meter-definition management requires readings.manage (technician lacks it)
    denied = await client.post("/api/v1/meter-definitions", headers=_auth(tech),
                               json={"code": "flow", "name": "Flow"})
    assert denied.status_code == 403

    # readings read is downsampled server-side (seed wrote 90 days on P-101)
    r = await client.get(f"/api/v1/equipment/{p101}/readings?meter=vibration&max_points=30",
                         headers=_auth(tech))
    assert r.status_code == 200, r.text
    series = next(s for s in r.json()["data"]["series"] if s["meter_code"] == "vibration")
    assert series["point_count"] >= 90
    assert series["downsampled"] is True
    assert len(series["points"]) <= 30


# ── S5 predictor reacts to reading signals ─────────────────────────────────────
def test_trend_and_threshold_signals():
    from app.modules.maintenance.prediction_service import _threshold_signal, _trend_signal

    rising = [2.0, 3.0, 4.0, 5.0, 6.0, 7.0]
    flat = [2.0, 2.0, 2.0, 2.0, 2.0, 2.0]
    assert _trend_signal(rising, 0.0, 7.1) > 0.3
    assert _trend_signal(flat, 0.0, 7.1) == 0.0
    # latest over the band ceiling → maxed out; mid-band → partial
    assert _threshold_signal(9.0, 0.0, 7.1) == 1.0
    assert 0.0 < _threshold_signal(3.55, 0.0, 7.1) < 1.0


async def test_predictor_uses_reading_signals_on_p101(db, client):
    await seed_run()
    from app.modules.maintenance.prediction_service import PredictionService

    tenant_id = await _tenant_id()
    p101 = await _equipment_id("P-101")
    async with SessionFactory() as s:
        preds = await PredictionService(s, tenant_id).refresh(actor=None)
        pred = next(p for p in preds if p.equipment_id == p101)
        factors = {d["factor"] for d in pred.drivers}
    # P-101's seeded vibration/temperature climb past the normal band → reading signals fire.
    assert "reading_trend" in factors or "threshold_proximity" in factors
    assert float(pred.risk_score) > 0
