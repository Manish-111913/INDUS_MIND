"""LLM provider adapter skeleton (docs/02 §10, §37).

Interfaces only for now. `core/llm.py` resolves a capability → active
`ai_model_configs` row at call time (cached ~60s) so switching models is a DB
row, zero deploys. Concrete providers (Anthropic/OpenAI/Ollama) land later.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass
from enum import StrEnum

from app.core.config import settings


class Capability(StrEnum):
    CHAT = "chat"
    EMBEDDING = "embedding"
    OCR_VISION = "ocr_vision"
    EXTRACTION = "extraction"
    RCA = "rca"
    COMPLIANCE = "compliance"
    LESSONS = "lessons"


@dataclass(slots=True)
class LLMMessage:
    role: str  # system | user | assistant
    content: str


@dataclass(slots=True)
class LLMResponse:
    text: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    latency_ms: int = 0


class LLMProvider(ABC):
    """Provider adapter contract. Implementations wrap Anthropic/OpenAI/Ollama."""

    name: str

    @abstractmethod
    async def complete(
        self, messages: list[LLMMessage], *, model: str, **params
    ) -> LLMResponse: ...

    @abstractmethod
    async def stream(
        self, messages: list[LLMMessage], *, model: str, **params
    ) -> AsyncIterator[str]: ...

    @abstractmethod
    async def embed(self, texts: list[str], *, model: str) -> list[list[float]]: ...


class NotConfiguredProvider(LLMProvider):
    """Default adapter until a real provider is wired — fails loudly, never silently."""

    name = "not_configured"

    async def complete(self, messages, *, model, **params) -> LLMResponse:
        raise NotImplementedError("LLM provider not yet implemented (skeleton, docs/02 §10)")

    async def stream(self, messages, *, model, **params) -> AsyncIterator[str]:
        raise NotImplementedError("LLM provider not yet implemented (skeleton, docs/02 §10)")
        yield  # pragma: no cover — makes this an async generator

    async def embed(self, texts, *, model) -> list[list[float]]:
        raise NotImplementedError("Embedding provider not yet implemented (skeleton)")


def get_provider(provider: str | None = None) -> LLMProvider:
    """Factory. Resolution by capability/model config comes with the ai module."""
    _ = provider or settings.llm_provider
    return NotConfiguredProvider()
