"""Hybrid retrieval service (docs/02 §10 step 8, §50).

query → scope pre-filter → pgvector ANN top-40 + Postgres FTS top-40 →
Reciprocal Rank Fusion → optional graph expansion (equipment tags in the query →
documents that mention them) → top_k chunks with provenance. Shared by search
(B7) and the copilot (B8). Embeddings use the same adapter as ingestion (bge
local; deterministic fallback offline) so ANN and FTS stay dimension-aligned.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.embeddings import get_embedding_provider
from app.core.logging import get_logger
from app.modules.documents.models import Document
from app.modules.ingestion.models import DocumentChunk

log = get_logger("knowledge.retrieval")

RRF_K = 60          # reciprocal-rank-fusion constant (docs/02 §10)
CANDIDATES = 40     # per-arm candidate pool
_TAG = re.compile(r"\b[A-Z]{1,4}-?[A-Z]?-?\d{1,4}[A-Z]?\b")


@dataclass(slots=True)
class RetrievalScope:
    plant_ids: list[uuid.UUID] = field(default_factory=list)
    equipment_ids: list[uuid.UUID] = field(default_factory=list)
    doc_type_ids: list[uuid.UUID] = field(default_factory=list)
    date_from: datetime | None = None
    date_to: datetime | None = None


@dataclass(slots=True)
class RetrievedChunk:
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    version_id: uuid.UUID | None
    page_no: int | None
    bbox: dict | None
    section_path: str | None
    text: str
    score: float          # fused rank score — ordering only, not relevance
    match_kind: str       # keyword | semantic
    similarity: float = 0.0  # absolute cosine similarity; 0.0 if not in the ANN arm


class RetrievalService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def retrieve(self, query: str, *, scope: RetrievalScope | None = None,
                       top_k: int = 8, filter_irrelevant: bool = True) -> list[RetrievedChunk]:
        """Fuse the two arms and drop chunks that are not evidence for `query`.

        The ANN arm is an unbounded nearest-neighbour scan: it returns its 40
        closest chunks for *any* input, including gibberish. RRF scores are
        rank-derived (1/(k+rank)), so they look identical whether the top hit is
        a perfect match or the least-bad of 40 unrelated chunks. Ranking alone
        therefore cannot answer "is any of this relevant?" — only the absolute
        cosine similarity can, so we carry it through fusion and gate on it here.
        """
        scope = scope or RetrievalScope()
        equip_doc_ids = await self._graph_expand(query, scope)

        vector_rows = await self._vector_search(query, scope, equip_doc_ids)
        fts_rows = await self._fts_search(query, scope, equip_doc_ids)

        # Reciprocal Rank Fusion over the two ranked lists.
        fused: dict[uuid.UUID, dict] = {}
        for rank, (chunk, similarity) in enumerate(vector_rows):
            fused.setdefault(chunk.id, {"chunk": chunk, "score": 0.0, "kinds": set(), "sim": 0.0})
            fused[chunk.id]["score"] += 1.0 / (RRF_K + rank)
            fused[chunk.id]["kinds"].add("semantic")
            fused[chunk.id]["sim"] = similarity
        for rank, chunk in enumerate(fts_rows):
            fused.setdefault(chunk.id, {"chunk": chunk, "score": 0.0, "kinds": set(), "sim": 0.0})
            fused[chunk.id]["score"] += 1.0 / (RRF_K + rank)
            fused[chunk.id]["kinds"].add("keyword")

        # graph-expansion boost for chunks in documents that mention query equipment
        for entry in fused.values():
            if entry["chunk"].document_id in equip_doc_ids:
                entry["score"] += 1.0 / RRF_K

        if filter_irrelevant:
            candidates = [e for e in fused.values() if self._is_evidence(e, equip_doc_ids)]
            if not candidates and fused:
                log.info("retrieval_no_relevant_chunks", query=query[:80], pool=len(fused))
        else:
            candidates = list(fused.values())

        ranked = sorted(candidates, key=lambda e: e["score"], reverse=True)[:top_k]
        return [
            RetrievedChunk(
                chunk_id=e["chunk"].id, document_id=e["chunk"].document_id,
                version_id=e["chunk"].version_id, page_no=e["chunk"].page_no,
                bbox=e["chunk"].bbox, section_path=e["chunk"].section_path,
                text=e["chunk"].text, score=round(e["score"], 5),
                match_kind="keyword" if "keyword" in e["kinds"] else "semantic",
                similarity=round(e["sim"], 4))
            for e in ranked
        ]

    def _is_evidence(self, entry: dict, equip_doc_ids: set[uuid.UUID]) -> bool:
        """Does this chunk actually support the query, or is it just ANN filler?

        Keyword (FTS) and graph hits are positive evidence on their own — the
        query's own terms or equipment tags are in the document. A semantic-only
        hit counts only when the provider produces real embeddings AND the
        similarity clears the floor. The hash fallback is deliberately treated as
        no evidence: its distances are noise, so trusting them would let gibberish
        through exactly as before.
        """
        if "keyword" in entry["kinds"] or entry["chunk"].document_id in equip_doc_ids:
            return True
        if not get_embedding_provider().semantic:
            return False
        return entry["sim"] >= settings.retrieval_min_similarity

    # ── arms ─────────────────────────────────────────────────────────────────
    def _base(self, scope: RetrievalScope, equip_doc_ids: set[uuid.UUID]) -> Select:
        stmt = (
            select(DocumentChunk)
            .join(Document, Document.id == DocumentChunk.document_id)
            .where(DocumentChunk.tenant_id == self.tenant_id, Document.deleted_at.is_(None))
        )
        if scope.plant_ids:
            stmt = stmt.where(Document.plant_id.in_(scope.plant_ids))
        if scope.doc_type_ids:
            stmt = stmt.where(Document.doc_type_id.in_(scope.doc_type_ids))
        if scope.date_from:
            stmt = stmt.where(Document.created_at >= scope.date_from)
        if scope.date_to:
            stmt = stmt.where(Document.created_at <= scope.date_to)
        if scope.equipment_ids:
            # scope by equipment → only documents that mention those equipment
            stmt = stmt.where(DocumentChunk.document_id.in_(equip_doc_ids or [uuid.UUID(int=0)]))
        return stmt

    async def _vector_search(self, query: str, scope: RetrievalScope,
                             equip_doc_ids: set[uuid.UUID]
                             ) -> list[tuple[DocumentChunk, float]]:
        """Top-N nearest chunks paired with absolute cosine similarity (1 - distance)."""
        qvec = (await self._embed(query))
        distance = DocumentChunk.embedding.cosine_distance(qvec).label("distance")
        stmt = (
            self._base(scope, equip_doc_ids)
            .add_columns(distance)
            .where(DocumentChunk.embedding.is_not(None))
            .order_by(distance)
            .limit(CANDIDATES)
        )
        rows = (await self.session.execute(stmt)).all()
        return [(row[0], 1.0 - float(row.distance)) for row in rows]

    async def _fts_search(self, query: str, scope: RetrievalScope,
                          equip_doc_ids: set[uuid.UUID]) -> list[DocumentChunk]:
        tsquery = func.plainto_tsquery("english", query)
        stmt = (
            self._base(scope, equip_doc_ids)
            .where(DocumentChunk.search_vector.op("@@")(tsquery))
            .order_by(func.ts_rank(DocumentChunk.search_vector, tsquery).desc())
            .limit(CANDIDATES)
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def _graph_expand(self, query: str, scope: RetrievalScope) -> set[uuid.UUID]:
        """Equipment tags in the query → documents that mention them (docs/02 §10)."""
        from app.modules.equipment.service import EquipmentService
        from app.modules.ingestion.repository import EntityRepository

        equipment_ids: set[uuid.UUID] = set(scope.equipment_ids)
        equipment = EquipmentService(self.session, self.tenant_id)
        for token in set(_TAG.findall(query)):
            matches = await equipment.resolve(token)
            if matches and matches[0]["score"] >= 0.6:
                equipment_ids.add(uuid.UUID(str(matches[0]["id"])))
        if not equipment_ids:
            return set()
        entities = EntityRepository(self.session, self.tenant_id)
        doc_ids: set[uuid.UUID] = set()
        for eid in equipment_ids:
            doc_ids |= await entities.documents_for_equipment(eid)
        return doc_ids

    async def _embed(self, query: str) -> list[float]:
        import asyncio

        provider = get_embedding_provider()
        vectors = await asyncio.to_thread(provider.embed, [query])
        return vectors[0]
