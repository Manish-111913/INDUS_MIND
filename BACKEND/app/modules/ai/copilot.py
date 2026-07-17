"""Copilot RAG graph (docs/02 §10 steps 8–11).

Staged graph (the LangGraph copilot DAG, implemented as composable async stages
so it runs and is testable offline):
  classify → retrieve → generate → cite_verify → confidence

generate uses the `copilot.answer` prompt template with numbered [1..n] context
blocks and hard citation rules. When no LLM key is configured it degrades to an
extractive answer built from the retrieved chunks (docs/02 §30 retrieval-only
mode) — every sentence still cites a real chunk, so citations always resolve.
"""

from __future__ import annotations

import re
import time
import uuid
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import llm
from app.core.config import settings
from app.core.embeddings import get_embedding_provider
from app.core.logging import get_logger
from app.modules.ai.repository import PromptRepository
from app.modules.documents.models import Document
from app.modules.knowledge.retrieval import RetrievalScope, RetrievalService, RetrievedChunk

log = get_logger("ai.copilot")

_CITE = re.compile(r"\[(\d+)\]")
_SENT = re.compile(r"(?<=[.!?])\s+")

_GREETINGS = {"hi", "hey", "hello", "yo", "thanks", "thank you", "ok", "okay", "bye", "test"}

_SMALLTALK_REPLY = (
    "Hello — I answer questions grounded in your plant's documents (OEM manuals, SOPs, "
    "inspection reports, work orders, shift logs). Ask me something like “what is the "
    "seal flush plan for P-101?” and I'll cite the sources I used."
)

_NO_EVIDENCE_REPLY = (
    "I could not find supporting information in the corpus for that question. Nothing in "
    "the indexed documents is a close enough match to answer it, and I won't guess. Try "
    "naming a specific equipment tag, procedure, or document."
)


@dataclass(slots=True)
class CopilotResult:
    answer: str
    citations: list[dict]
    confidence: dict  # {level, score}
    latency_ms: int
    cached: bool = False
    prompt_version: int | None = None
    token_usage: dict = field(default_factory=dict)
    intent: str = "question"


class CopilotService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def run(self, query: str, *, scope: RetrievalScope | None = None) -> CopilotResult:
        t0 = time.monotonic()
        intent = self._classify(query)
        if intent == "smalltalk":
            # A greeting has no answer in the corpus. Retrieving anyway is what
            # made "hi" come back cited to a random OEM manual.
            return CopilotResult(
                answer=_SMALLTALK_REPLY, citations=[], confidence={"level": "Low", "score": 0.0},
                latency_ms=int((time.monotonic() - t0) * 1000), intent=intent)
        chunks = await RetrievalService(self.session, self.tenant_id).retrieve(
            query, scope=scope, top_k=8)
        titles = await self._titles(chunks)
        answer, usage, prompt_version = await self._generate(query, chunks, titles)
        answer, resolved = self._cite_verify(answer, chunks, titles)
        confidence = await self._confidence(chunks, answer, resolved)
        return CopilotResult(
            answer=answer.strip(), citations=resolved, confidence=confidence,
            latency_ms=int((time.monotonic() - t0) * 1000), prompt_version=prompt_version,
            token_usage=usage, intent=intent)

    # ── classify ─────────────────────────────────────────────────────────────
    def _classify(self, query: str) -> str:
        q = query.strip().lower()
        if q.split(" ", 1)[0] in {"create", "open", "run", "generate", "assign", "close"}:
            return "command"
        if q.strip(" .!?") in _GREETINGS or len(q) < 4:
            return "smalltalk"
        return "question"

    # ── generate ─────────────────────────────────────────────────────────────
    async def _generate(self, query: str, chunks: list[RetrievedChunk],
                        titles: dict[uuid.UUID, str]) -> tuple[str, dict, int | None]:
        template = await PromptRepository(self.session).active(self.tenant_id, "copilot.answer")
        prompt_version = template.version if template else None
        if not chunks:
            return _NO_EVIDENCE_REPLY, {}, prompt_version

        context = "\n\n".join(
            f"[{i}] {titles.get(c.document_id, 'Document')} (p.{c.page_no or '-'}): {c.text[:600]}"
            for i, c in enumerate(chunks, start=1))

        if self._llm_configured():
            from app.modules.ai.service import PromptService

            rendered = await PromptService(self.session).render(
                self.tenant_id, "copilot.answer", {"question": query, "context": context})
            resp = await llm.complete(self.session, self.tenant_id, "chat",
                                      messages=[llm.LLMMessage(role="user", content=rendered)])
            usage = {"prompt_tokens": resp.prompt_tokens, "completion_tokens": resp.completion_tokens}
            return resp.text, usage, prompt_version

        # extractive fallback — cite every synthesized sentence
        lead = f"Based on the available sources regarding “{query.strip()}”:"
        sentences = []
        for i, c in enumerate(chunks[:4], start=1):
            excerpt = _first_sentence(c.text)
            sentences.append(f"{excerpt} [{i}]")
        answer = lead + " " + " ".join(sentences)
        return answer, {"prompt_tokens": 0, "completion_tokens": 0}, prompt_version

    # ── cite_verify ──────────────────────────────────────────────────────────
    def _cite_verify(self, answer: str, chunks: list[RetrievedChunk],
                     titles: dict[uuid.UUID, str]) -> tuple[str, list[dict]]:
        used: dict[int, RetrievedChunk] = {}
        for m in _CITE.finditer(answer):
            n = int(m.group(1))
            if 1 <= n <= len(chunks):
                used[n] = chunks[n - 1]

        # strip citation markers that don't resolve to a provided chunk
        def _strip(match: re.Match) -> str:
            n = int(match.group(1))
            return match.group(0) if n in used else ""

        answer = _CITE.sub(_strip, answer)

        citations = [
            {"n": n, "document_id": str(c.document_id),
             "version_id": str(c.version_id) if c.version_id else None,
             "page": c.page_no, "chunk_id": str(c.chunk_id),
             "title": titles.get(c.document_id, "Document"),
             "snippet": c.text[:200].strip()}
            for n, c in sorted(used.items())
        ]
        return answer, citations

    # ── confidence ───────────────────────────────────────────────────────────
    async def _confidence(self, chunks: list[RetrievedChunk], answer: str,
                          citations: list[dict]) -> dict:
        config = await llm.resolve_config(self.session, self.tenant_id, "chat")
        threshold = config.confidence_threshold

        if not chunks or not citations:
            return {"level": "Low", "score": 0.0}

        # Grounding must come from how well the cited chunks match the *query*.
        # The old formula divided each chunk's score by the top score, which
        # measures spread within the result set — always ~0.9 whether or not the
        # chunks had anything to do with the question. Use absolute similarity;
        # when the provider can't produce it, fall back to keyword-match rate,
        # which is real evidence (the query's terms are literally in the chunk).
        cited_chunks = [chunks[c["n"] - 1] for c in citations if 0 < c["n"] <= len(chunks)]
        if not cited_chunks:
            return {"level": "Low", "score": 0.0}
        if get_embedding_provider().semantic:
            grounding = sum(max(0.0, c.similarity) for c in cited_chunks) / len(cited_chunks)
        else:
            # Hash-embedding deployments have no semantic signal to measure, so the
            # only honest evidence is lexical overlap. This caps such deployments
            # well below "High" — correct: retrieval really is weaker without a
            # model, and overstating it is the bug this replaced.
            grounding = sum(1.0 for c in cited_chunks if c.match_kind == "keyword") / len(cited_chunks)

        sentences = [s for s in _SENT.split(answer) if s.strip()]
        cited = sum(1 for s in sentences if _CITE.search(s))
        coverage = (cited / len(sentences)) if sentences else 0.0

        # Coverage is near-1.0 by construction in the extractive path (the template
        # cites every sentence it emits), so it can only ever confirm formatting —
        # grounding carries the weight.
        score = round(0.75 * grounding + 0.25 * coverage, 3)
        level = "High" if score >= threshold else ("Medium" if score >= threshold * 0.6 else "Low")
        return {"level": level, "score": score}

    # ── helpers ──────────────────────────────────────────────────────────────
    async def _titles(self, chunks: list[RetrievedChunk]) -> dict[uuid.UUID, str]:
        if not chunks:
            return {}
        ids = {c.document_id for c in chunks}
        rows = (await self.session.execute(select(Document).where(Document.id.in_(ids)))).scalars()
        return {d.id: d.title for d in rows}

    @staticmethod
    def _llm_configured() -> bool:
        return llm.provider_key_present(settings.llm_provider)


def _first_sentence(text: str, limit: int = 220) -> str:
    text = " ".join(text.split())
    parts = _SENT.split(text)
    out = parts[0] if parts else text
    return (out[:limit].rstrip(" .") + ".") if out else ""
