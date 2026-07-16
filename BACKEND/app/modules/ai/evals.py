"""AI evaluation harness (docs/02 §15, §54).

Runs the benchmark questions through the copilot and scores fact-coverage,
citation-correctness and latency — the judging metrics (answer quality,
time-to-answer). Shared by the /ai/evals API and evals/run_eval.py.
"""

from __future__ import annotations

import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.modules.ai.copilot import CopilotService
from app.modules.ai.models import EvalRun
from app.modules.documents.models import Document
from app.modules.knowledge.retrieval import RetrievalService

log = get_logger("ai.evals")

QUESTIONS_FILE = Path(__file__).resolve().parents[3] / "evals" / "benchmark_questions.yaml"


def load_questions() -> list[dict]:
    import yaml

    if not QUESTIONS_FILE.exists():
        return []
    data = yaml.safe_load(QUESTIONS_FILE.read_text(encoding="utf-8")) or {}
    return data.get("questions", []) or []


async def flagged_questions(session: AsyncSession, tenant_id: uuid.UUID | str) -> list[dict]:
    """Down-voted copilot questions as extra eval cases (docs/05 S4 quality loop)."""
    from app.modules.ai.repository import AIObservabilityRepository

    texts = await AIObservabilityRepository(session, tenant_id).flagged_questions()
    return [{"id": f"flag-{i + 1}", "question": q, "expected_facts": [], "expected_doc": None,
             "flagged": True} for i, q in enumerate(texts)]


async def run_evals(session: AsyncSession, tenant_id: uuid.UUID | str, *,
                    persist: bool = True, include_flagged: bool = False) -> dict:
    questions = load_questions()
    if include_flagged:
        questions = questions + await flagged_questions(session, tenant_id)
    copilot = CopilotService(session, tenant_id)
    retrieval = RetrievalService(session, tenant_id)
    results: list[dict] = []

    for q in questions:
        question = q["question"]
        result = await copilot.run(question)
        retrieved = await retrieval.retrieve(question, top_k=8)
        titles = await _titles(session, {c.document_id for c in retrieved})
        corpus = (result.answer + " " + " ".join(c.text for c in retrieved)).lower()

        facts = q.get("expected_facts", []) or []
        found = sum(1 for f in facts if str(f).lower() in corpus)
        fact_coverage = round(found / len(facts), 3) if facts else 1.0

        expected_doc = (q.get("expected_doc") or "").lower()
        cited_titles = {c.get("title", "").lower() for c in result.citations}
        retrieved_titles = {t.lower() for t in titles.values()}
        citation_correct = bool(expected_doc) and any(
            expected_doc in t for t in cited_titles | retrieved_titles)

        results.append({
            "id": q.get("id"), "question": question,
            "fact_coverage": fact_coverage, "citation_correct": citation_correct,
            "citations": len(result.citations), "latency_ms": result.latency_ms,
            "confidence": result.confidence["score"], "flagged": bool(q.get("flagged", False)),
        })

    n = len(results) or 1
    summary = {
        "questions": len(results),
        "avg_fact_coverage": round(sum(r["fact_coverage"] for r in results) / n, 3),
        "citation_accuracy": round(sum(1 for r in results if r["citation_correct"]) / n, 3),
        "avg_latency_ms": round(sum(r["latency_ms"] for r in results) / n, 1),
        "avg_confidence": round(sum(r["confidence"] for r in results) / n, 3),
    }

    if persist:
        run = EvalRun(tenant_id=tenant_id, status="completed", summary=summary, results=results)
        session.add(run)
        await session.flush()
        summary["run_id"] = str(run.id)
    return {"summary": summary, "results": results}


async def _titles(session: AsyncSession, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not ids:
        return {}
    rows = (await session.execute(select(Document).where(Document.id.in_(ids)))).scalars()
    return {d.id: d.title for d in rows}
