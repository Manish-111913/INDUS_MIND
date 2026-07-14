"""Pipeline golden tests (docs/02 §11, §54 — "golden sample docs → assert
entities/chunks/graph edges").

Three deterministic sample PDFs are pushed through the full ingestion pipeline
(parse → chunk → embed → extract entities → project graph) exactly as the worker
runs it. The extractor and embedder use their deterministic fallbacks (regex
entity extraction + hashed embeddings), so these assertions hold with no API key
or GPU. We assert *tolerance-based* expectations — chunk-count ranges, a minimum
entity count plus specific expected entity values, and at least one graph edge on
the document node — not brittle exact counts, so normal extractor tuning won't
flap the suite. Skips cleanly when MinIO / Neo4j aren't reachable.
"""

from __future__ import annotations

import hashlib

import httpx
from sqlalchemy import select

from app.core import graph
from app.core.database import SessionFactory
from app.modules.ingestion.models import ExtractedEntity
from app.modules.ingestion.pipeline import run_pipeline
from app.modules.ingestion.repository import ChunkRepository
from seeds.sample_data import generate_pdf
from seeds.seed import DEMO_PASSWORD
from seeds.seed import run as seed_run

# Each golden doc references seeded equipment (P-101, C-3, FW-P1) so the graph
# projection links Document → Equipment. Bodies are padded so parsing/chunking
# have real content to work with.
GOLDEN_DOCS = [
    {
        "filename": "gold_p101_datasheet.pdf",
        "title": "GOLD P-101 Centrifugal Pump Datasheet",
        "paragraphs": [
            "Centrifugal pump P-101 rated flow is 450 m3/h at 120 m head, driven at "
            "2980 rpm by a 250 kW motor. " * 8,
            "Bonnet bolt torque for P-101 is 210 Nm in a star pattern. Mechanical seal "
            "is a John Crane 5610 with API Plan 11 flush. Bearing oil grade ISO VG 68. " * 8,
        ],
        "min_chunks": 1,
        "max_chunks": 12,
        "expect_entity_values": ["P-101"],
        "expect_entity_substr": ["Nm"],
        "min_entities": 3,
    },
    {
        "filename": "gold_wo2041.pdf",
        "title": "GOLD Work Order WO-2041 P-101 Seal Replacement",
        "paragraphs": [
            "Work order WO-2041 replaced the P-101 mechanical seal after a seal_leak "
            "failure. Vibration reached 7.1 mm/s before the trip. Standby pump P-102 "
            "auto-started. " * 8,
        ],
        "min_chunks": 1,
        "max_chunks": 8,
        "expect_entity_values": ["P-101"],
        "expect_entity_substr": ["mm/s"],
        "min_entities": 2,
    },
    {
        "filename": "gold_sop114.pdf",
        "title": "GOLD SOP-114 Firewater Pump Quarterly Testing",
        "paragraphs": [
            "SOP-114 requires firewater pump FW-P1 to run for 30 minutes at rated flow "
            "of 410 m3/h each quarter, with a diesel auto-start within 15 seconds. " * 8,
        ],
        "min_chunks": 1,
        "max_chunks": 8,
        "expect_entity_values": ["FW-P1"],
        "expect_entity_substr": ["m3/h"],
        "min_entities": 2,
    },
]


async def _headers(client) -> dict:
    resp = await client.post(
        "/api/v1/auth/login", json={"email": "admin@indusmind.io", "password": DEMO_PASSWORD}
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['data']['access_token']}"}


async def _tenant_id(client, headers) -> str:
    me = (await client.get("/api/v1/auth/me", headers=headers)).json()["data"]
    return me["user"]["tenant_id"]


async def _upload_and_confirm(client, headers, pdf: bytes, filename: str, title: str) -> str:
    up = await client.post("/api/v1/documents/upload-url", headers=headers, json={
        "filename": filename, "mime": "application/pdf", "size": len(pdf), "title": title})
    d = up.json()["data"]
    async with httpx.AsyncClient(timeout=30) as s3:
        put = await s3.put(d["presigned_url"], content=pdf,
                           headers={"Content-Type": "application/pdf"})
        assert put.status_code in (200, 204), put.text
    conf = await client.post(f"/api/v1/documents/{d['document_id']}/confirm", headers=headers,
                             json={"checksum": hashlib.sha256(pdf).hexdigest(), "meta": {}})
    assert conf.status_code == 200, conf.text
    return d["document_id"]


async def test_pipeline_golden_docs(db, minio, neo4j, client):
    """Each golden doc yields expected chunks, entities and a graph edge."""
    await seed_run()  # seeds equipment P-101/C-3/FW-P1 that docs reference
    headers = await _headers(client)
    tenant_id = await _tenant_id(client, headers)

    total_edges = 0
    for spec in GOLDEN_DOCS:
        pdf = generate_pdf(spec["title"], spec["paragraphs"])
        doc_id = await _upload_and_confirm(client, headers, pdf, spec["filename"], spec["title"])

        async with SessionFactory() as session:
            job = await run_pipeline(session, tenant_id, doc_id)
            await session.commit()
        assert job.status == "completed", f"{spec['filename']}: job {job.status}"

        # ── chunks ────────────────────────────────────────────────────────────
        async with SessionFactory() as session:
            chunks = await ChunkRepository(session, tenant_id).list_for_document(doc_id)
        n_chunks = len(chunks)
        assert spec["min_chunks"] <= n_chunks <= spec["max_chunks"], (
            f"{spec['filename']}: {n_chunks} chunks outside "
            f"[{spec['min_chunks']}, {spec['max_chunks']}]"
        )
        assert all(c.token_count and c.token_count > 0 for c in chunks), "empty chunk token_count"
        assert all(c.embedding is not None and len(c.embedding) == 1024 for c in chunks), (
            f"{spec['filename']}: chunks missing 1024-dim embeddings"
        )

        # ── entities ──────────────────────────────────────────────────────────
        async with SessionFactory() as session:
            values = list((await session.execute(
                select(ExtractedEntity.value).where(
                    ExtractedEntity.document_id == doc_id,
                    ExtractedEntity.tenant_id == tenant_id,
                ))).scalars())
        assert len(values) >= spec["min_entities"], (
            f"{spec['filename']}: {len(values)} entities < {spec['min_entities']}"
        )
        lowered = " | ".join(values).lower()
        for expected in spec["expect_entity_values"]:
            assert expected.lower() in lowered, (
                f"{spec['filename']}: expected entity '{expected}' not extracted; got {values}"
            )
        for substr in spec["expect_entity_substr"]:
            assert substr.lower() in lowered, (
                f"{spec['filename']}: no entity containing '{substr}'; got {values}"
            )

        # ── graph edges (best-effort projection) ──────────────────────────────
        edges = await graph.run_read(
            "MATCH (d:Document {pg_id:$doc})-[r]-() RETURN count(r) AS c", {"doc": str(doc_id)}
        )
        doc_edges = edges[0]["c"] if edges else 0
        assert doc_edges >= 1, f"{spec['filename']}: document node has no graph edges"
        total_edges += doc_edges

    # Across the three docs the graph gained a meaningful number of edges.
    assert total_edges >= 3, f"only {total_edges} total graph edges across golden docs"
