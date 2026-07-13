"""Embedding provider adapter (docs/02 §10 step 4, §37).

Default is local bge-large-en-v1.5 (1024-dim) via sentence-transformers, switchable
by EMBEDDING_PROVIDER. When the heavy model isn't installed (dev/test/no-GPU), we
fall back to a deterministic 1024-dim hash embedding so the pipeline still runs and
produces real, stable pgvector values — clearly a dev convenience, not for prod
retrieval quality (the worker image ships sentence-transformers).
"""

from __future__ import annotations

import hashlib
import math
import struct
from abc import ABC, abstractmethod
from functools import lru_cache

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("core.embeddings")

EMBEDDING_DIM = 1024
EMBED_BATCH = 64  # docs/02 §50


class EmbeddingProvider(ABC):
    name: str
    dim: int = EMBEDDING_DIM

    @abstractmethod
    def embed(self, texts: list[str]) -> list[list[float]]: ...

    def embed_batched(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for i in range(0, len(texts), EMBED_BATCH):
            out.extend(self.embed(texts[i:i + EMBED_BATCH]))
        return out


class LocalBGEEmbedding(EmbeddingProvider):
    name = "local-bge"

    def __init__(self, model_name: str) -> None:
        from sentence_transformers import SentenceTransformer  # lazy, heavy

        self._model = SentenceTransformer(model_name)

    def embed(self, texts: list[str]) -> list[list[float]]:
        vecs = self._model.encode(texts, normalize_embeddings=True, batch_size=EMBED_BATCH)
        return [v.tolist() for v in vecs]


class OpenAIEmbedding(EmbeddingProvider):
    name = "openai"

    def __init__(self, model_name: str) -> None:
        from openai import OpenAI  # lazy

        self._client = OpenAI(api_key=settings.openai_api_key)
        self._model = model_name

    def embed(self, texts: list[str]) -> list[list[float]]:
        resp = self._client.embeddings.create(model=self._model, input=texts)
        return [d.embedding for d in resp.data]


class DeterministicEmbedding(EmbeddingProvider):
    """Stable 1024-dim unit vector from the text hash — no model, fully offline."""

    name = "deterministic"

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(t) for t in texts]

    @staticmethod
    def _vector(text: str) -> list[float]:
        floats: list[float] = []
        counter = 0
        base = text.encode("utf-8")
        while len(floats) < EMBEDDING_DIM:
            digest = hashlib.sha256(base + counter.to_bytes(4, "big")).digest()  # 32 bytes
            for i in range(0, 32, 4):
                floats.append(struct.unpack(">I", digest[i:i + 4])[0] / 2**32 - 0.5)
            counter += 1
        floats = floats[:EMBEDDING_DIM]
        norm = math.sqrt(sum(f * f for f in floats)) or 1.0
        return [f / norm for f in floats]


@lru_cache
def get_embedding_provider() -> EmbeddingProvider:
    provider = settings.embedding_provider
    try:
        if provider == "openai":
            return OpenAIEmbedding("text-embedding-3-large")
        return LocalBGEEmbedding(settings.embedding_model)
    except Exception as exc:  # noqa: BLE001 — missing model/lib → deterministic fallback
        log.warning("embedding_provider_fallback", requested=provider, error=str(exc),
                    fallback="deterministic")
        return DeterministicEmbedding()
