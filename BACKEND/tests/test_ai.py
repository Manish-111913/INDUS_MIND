"""Copilot RAG + chat SSE + evals + rate-limit tests (docs/02 §10 8–11, §15, §16, §40).

Runs against MinIO with a small P-101 corpus. Uses the extractive/offline copilot
path (no LLM key), so answers are grounded and every sentence cites a real chunk.
"""

from __future__ import annotations

import hashlib
import json

import httpx

from app.core.database import SessionFactory
from seeds.sample_data import generate_pdf
from seeds.seed import DEMO_PASSWORD
from seeds.seed import run as seed_run


async def _headers(client, email: str = "admin@indusmind.io") -> dict:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['data']['access_token']}"}


async def _tenant_id(client, headers) -> str:
    return (await client.get("/api/v1/auth/me", headers=headers)).json()["data"]["user"]["tenant_id"]


async def _ingest(client, headers, tenant_id, title, paras) -> str:
    pdf = generate_pdf(title, paras)
    up = await client.post("/api/v1/documents/upload-url", headers=headers, json={
        "filename": f"{abs(hash(title)) % 10000}.pdf", "mime": "application/pdf",
        "size": len(pdf), "title": title})
    d = up.json()["data"]
    async with httpx.AsyncClient(timeout=30) as s3:
        put = await s3.put(d["presigned_url"], content=pdf, headers={"Content-Type": "application/pdf"})
        assert put.status_code in (200, 204)
    await client.post(f"/api/v1/documents/{d['document_id']}/confirm", headers=headers,
                      json={"checksum": hashlib.sha256(pdf).hexdigest(), "meta": {}})
    async with SessionFactory() as session:
        from app.modules.ingestion.pipeline import run_pipeline
        await run_pipeline(session, tenant_id, d["document_id"])
        await session.commit()
    return d["document_id"]


async def _p101_corpus(client, headers, tenant_id):
    await _ingest(client, headers, tenant_id, "Centrifugal Pump P-101 OEM Manual", [
        "P-101 bonnet bolt torque is 210 Nm. Mechanical seal John Crane 5610. " * 4])
    await _ingest(client, headers, tenant_id, "Work Order WO-2041 P-101 Seal Replacement", [
        "WO-2041: mechanical seal leak on P-101 resolved by replacing the John Crane 5610 seal. " * 4])
    await _ingest(client, headers, tenant_id, "Incident Report P-101 Trip", [
        "P-101 tripped on high vibration 7.3 mm/s. Standby P-102 auto-started. Fixed by alignment. " * 4])


# ── /ai/query ──────────────────────────────────────────────────────────────────
async def test_ai_query_returns_answer_with_citations(db, minio, client):
    await seed_run()
    headers = await _headers(client)
    tenant_id = await _tenant_id(client, headers)
    await _p101_corpus(client, headers, tenant_id)

    resp = await client.post("/api/v1/ai/query", headers=headers, json={
        "query": "What were the last failures on pump P-101 and what fixed them?"})
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["answer"]
    assert len(data["citations"]) >= 2
    assert data["confidence"]["level"] in ("High", "Medium", "Low")
    assert 0.0 <= data["confidence"]["score"] <= 1.0
    # citation shape (§16)
    cit = data["citations"][0]
    assert {"n", "document_id", "page", "chunk_id", "snippet"} <= set(cit)


async def test_ai_query_semantic_cache(db, minio, client):
    await seed_run()
    headers = await _headers(client)
    tenant_id = await _tenant_id(client, headers)
    await _p101_corpus(client, headers, tenant_id)

    q = {"query": "What seal is used on P-101?"}
    first = await client.post("/api/v1/ai/query", headers=headers, json=q)
    assert first.json()["data"]["cached"] is False
    second = await client.post("/api/v1/ai/query", headers=headers, json=q)
    assert second.json()["data"]["cached"] is True  # ≥0.97 similarity replay


# ── chat SSE ───────────────────────────────────────────────────────────────────
async def _consume_sse(resp) -> list[dict]:
    events, cur = [], {}
    async for line in resp.aiter_lines():
        if line.startswith("event:"):
            cur["event"] = line[6:].strip()
        elif line.startswith("data:"):
            cur["data"] = json.loads(line[5:].strip())
        elif line == "" and cur:
            events.append(cur)
            cur = {}
    if cur:
        events.append(cur)
    return events


async def test_chat_sse_stream(db, minio, client):
    await seed_run()
    headers = await _headers(client)
    tenant_id = await _tenant_id(client, headers)
    await _p101_corpus(client, headers, tenant_id)

    created = await client.post("/api/v1/chat/sessions", headers=headers, json={"title": "P-101"})
    sid = created.json()["data"]["id"]

    async with client.stream(
        "POST", f"/api/v1/chat/sessions/{sid}/messages", headers=headers,
        json={"content": "What were the last failures on pump P-101 and what fixed them?"},
    ) as resp:
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]
        events = await _consume_sse(resp)

    kinds = [e["event"] for e in events]
    assert "token" in kinds
    citations = [e for e in events if e["event"] == "citation"]
    assert len(citations) >= 2
    done = next(e for e in events if e["event"] == "done")["data"]
    assert done["message_id"] and done["confidence"]["level"] in ("High", "Medium", "Low")

    # message persisted with citations
    msgs = (await client.get(f"/api/v1/chat/sessions/{sid}/messages", headers=headers)).json()["data"]
    assistant = [m for m in msgs if m["role"] == "assistant"]
    assert assistant and len(assistant[0]["citations"]) >= 2


async def test_chat_feedback(db, minio, client):
    await seed_run()
    headers = await _headers(client)
    tenant_id = await _tenant_id(client, headers)
    await _p101_corpus(client, headers, tenant_id)
    sid = (await client.post("/api/v1/chat/sessions", headers=headers, json={})).json()["data"]["id"]
    async with client.stream("POST", f"/api/v1/chat/sessions/{sid}/messages", headers=headers,
                             json={"content": "What fixed P-101?"}) as resp:
        events = await _consume_sse(resp)
    mid = next(e for e in events if e["event"] == "done")["data"]["message_id"]
    fb = await client.post(f"/api/v1/chat/messages/{mid}/feedback", headers=headers,
                           json={"value": "up"})
    assert fb.status_code == 200


# ── insights + evals ───────────────────────────────────────────────────────────
async def test_insights(db, client):
    await seed_run()
    headers = await _headers(client)
    resp = await client.get("/api/v1/ai/insights", headers=headers,
                            params={"role": "Plant Manager"})
    assert resp.status_code == 200
    titles = [i["title"] for i in resp.json()["data"]]
    assert any("P-101" in t for t in titles)


async def test_eval_run_scores(db, minio, client):
    await seed_run()
    headers = await _headers(client)
    tenant_id = await _tenant_id(client, headers)
    await _p101_corpus(client, headers, tenant_id)

    questions = (await client.get("/api/v1/ai/evals/questions", headers=headers)).json()["data"]
    assert len(questions["questions"]) == 25

    run = await client.post("/api/v1/ai/evals/run", headers=headers)
    assert run.status_code == 200
    summary = run.json()["data"]["summary"]
    assert summary["questions"] == 25
    assert 0.0 <= summary["avg_fact_coverage"] <= 1.0
    assert summary["avg_latency_ms"] >= 0
    # some P-101 facts are in the mini-corpus → coverage must be > 0
    assert summary["avg_fact_coverage"] > 0
    run_id = summary["run_id"]
    detail = await client.get(f"/api/v1/ai/evals/runs/{run_id}", headers=headers)
    assert detail.status_code == 200 and len(detail.json()["data"]["results"]) == 25


# ── rate limiter (unit) ─────────────────────────────────────────────────────────
async def test_rate_limiter_sliding_window(db):
    from app.core.ratelimit import limiter

    key = "ratelimit:test:user1"
    allowed = [await limiter.check(key, 3, 60) for _ in range(4)]
    assert [a[0] for a in allowed] == [True, True, True, False]
    assert allowed[-1][1] >= 1  # Retry-After seconds
