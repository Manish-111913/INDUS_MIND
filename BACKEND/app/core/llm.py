"""LLM provider adapter (docs/02 §10, §30, §37).

`core/llm.py` resolves a capability → active `ai_model_configs` row at call time
(cached ~60s) and dispatches to the configured provider (Anthropic / OpenAI /
Gemini / Grok / Ollama). When no API key is configured it falls back to a deterministic mock so
the pipeline still runs offline (dev/test). Token usage is metered to llm_usage.
Providers are lazy-imported so the app boots without the SDKs installed.
"""

from __future__ import annotations

import json
import re
import time
import uuid
from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import StrEnum

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ExternalServiceError
from app.core.logging import get_logger

log = get_logger("core.llm")

_CONFIG_TTL = 60.0
_config_cache: dict[tuple[str, str], tuple[float, ResolvedConfig]] = {}


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


@dataclass(slots=True)
class ResolvedConfig:
    provider: str
    model_name: str
    params: dict = field(default_factory=dict)
    confidence_threshold: float = 0.7
    config_id: uuid.UUID | None = None
    price_input_usd: float = 0.0   # USD per 1M prompt tokens (from ai_model_configs)
    price_output_usd: float = 0.0  # USD per 1M completion tokens


# ── providers ─────────────────────────────────────────────────────────────────
class LLMProvider(ABC):
    name: str

    @abstractmethod
    def complete(self, messages: list[LLMMessage], *, model: str, **params) -> LLMResponse: ...


class AnthropicProvider(LLMProvider):
    name = "anthropic"

    def complete(self, messages, *, model, **params) -> LLMResponse:
        import anthropic  # lazy

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        system = "\n".join(m.content for m in messages if m.role == "system") or None
        turns = [{"role": m.role, "content": m.content} for m in messages if m.role != "system"]
        t0 = time.monotonic()
        resp = client.messages.create(
            model=model, system=system, messages=turns,
            max_tokens=params.get("max_tokens", 1024), temperature=params.get("temperature", 0.2))
        text = "".join(block.text for block in resp.content if block.type == "text")
        return LLMResponse(text=text, model=model, prompt_tokens=resp.usage.input_tokens,
                           completion_tokens=resp.usage.output_tokens,
                           latency_ms=int((time.monotonic() - t0) * 1000))


class OpenAIProvider(LLMProvider):
    name = "openai"

    def _api_key(self) -> str:
        return settings.openai_api_key

    def _base_url(self) -> str | None:
        return None  # None → the SDK's default (api.openai.com)

    def complete(self, messages, *, model, **params) -> LLMResponse:
        from openai import OpenAI  # lazy

        client = OpenAI(api_key=self._api_key(), base_url=self._base_url())
        t0 = time.monotonic()
        resp = client.chat.completions.create(
            model=model, messages=[{"role": m.role, "content": m.content} for m in messages],
            max_tokens=params.get("max_tokens", 1024), temperature=params.get("temperature", 0.2))
        usage = resp.usage
        return LLMResponse(text=resp.choices[0].message.content or "", model=model,
                           prompt_tokens=usage.prompt_tokens, completion_tokens=usage.completion_tokens,
                           latency_ms=int((time.monotonic() - t0) * 1000))


class GrokProvider(OpenAIProvider):
    """xAI Grok. The API is OpenAI chat-completions compatible, so only the
    credential and base URL differ — everything else is inherited."""

    name = "grok"

    def _api_key(self) -> str:
        return settings.grok_api_key

    def _base_url(self) -> str | None:
        return settings.grok_base_url


class GeminiProvider(LLMProvider):
    name = "gemini"

    def complete(self, messages, *, model, **params) -> LLMResponse:
        from google import genai  # lazy
        from google.genai import types

        client = genai.Client(api_key=settings.gemini_api_key)
        # Gemini takes the system prompt out-of-band and only accepts user/model
        # turns, so system messages are hoisted the same way Anthropic needs.
        system = "\n".join(m.content for m in messages if m.role == "system") or None
        contents = [
            types.Content(role="model" if m.role == "assistant" else "user",
                          parts=[types.Part.from_text(text=m.content)])
            for m in messages if m.role != "system"
        ]
        t0 = time.monotonic()
        resp = client.models.generate_content(
            model=model, contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system,
                max_output_tokens=params.get("max_tokens", 1024),
                temperature=params.get("temperature", 0.2)))
        usage = resp.usage_metadata
        return LLMResponse(text=resp.text or "", model=model,
                           prompt_tokens=getattr(usage, "prompt_token_count", 0) or 0,
                           completion_tokens=getattr(usage, "candidates_token_count", 0) or 0,
                           latency_ms=int((time.monotonic() - t0) * 1000))


class OllamaProvider(LLMProvider):
    name = "ollama"

    def complete(self, messages, *, model, **params) -> LLMResponse:
        import httpx  # lazy

        t0 = time.monotonic()
        resp = httpx.post(f"{settings.ollama_url}/api/chat", timeout=120, json={
            "model": model, "stream": False,
            "messages": [{"role": m.role, "content": m.content} for m in messages]})
        resp.raise_for_status()
        data = resp.json()
        return LLMResponse(text=data["message"]["content"], model=model,
                           prompt_tokens=data.get("prompt_eval_count", 0),
                           completion_tokens=data.get("eval_count", 0),
                           latency_ms=int((time.monotonic() - t0) * 1000))


class MockProvider(LLMProvider):
    """Offline fallback — returns an empty JSON object so structured callers get a
    valid (empty) result and downstream logic degrades gracefully (docs/02 §30)."""

    name = "mock"

    def complete(self, messages, *, model, **params) -> LLMResponse:
        return LLMResponse(text="{}", model=model, prompt_tokens=0, completion_tokens=0)


def provider_key_present(provider: str) -> bool:
    """Whether `provider` has the credential it needs to make a real call.

    Ollama is self-hosted, so a reachable URL stands in for a key. Callers use
    this to decide between a live provider and the offline mock; keep it the one
    place that knows which setting backs which provider.
    """
    return {
        "anthropic": bool(settings.anthropic_api_key),
        "openai": bool(settings.openai_api_key),
        "gemini": bool(settings.gemini_api_key),
        "grok": bool(settings.grok_api_key),
        "ollama": bool(settings.ollama_url),
    }.get(provider, False)


def _provider_for(config: ResolvedConfig) -> LLMProvider:
    if not provider_key_present(config.provider):
        log.warning("llm_provider_fallback_mock", provider=config.provider)
        return MockProvider()
    providers: dict[str, Callable[[], LLMProvider]] = {
        "anthropic": AnthropicProvider, "openai": OpenAIProvider, "gemini": GeminiProvider,
        "grok": GrokProvider, "ollama": OllamaProvider,
    }
    return providers[config.provider]()


# ── config resolution (cached ~60s) ──────────────────────────────────────────
async def resolve_config(session: AsyncSession, tenant_id: uuid.UUID | str | None,
                         capability: str) -> ResolvedConfig:
    cache_key = (str(tenant_id), capability)
    hit = _config_cache.get(cache_key)
    if hit and (time.monotonic() - hit[0]) < _CONFIG_TTL:
        return hit[1]

    from app.modules.ai.repository import AIConfigRepository

    row = await AIConfigRepository(session).active_for_capability(tenant_id, capability)
    if row is not None:
        config = ResolvedConfig(provider=row.provider, model_name=row.model_name,
                                params=dict(row.params or {}),
                                confidence_threshold=float(row.confidence_threshold),
                                config_id=row.id,
                                price_input_usd=float(row.price_input_usd or 0),
                                price_output_usd=float(row.price_output_usd or 0))
    else:
        config = _default_config(capability)
    _config_cache[cache_key] = (time.monotonic(), config)
    return config


def _default_config(capability: str) -> ResolvedConfig:
    models = {"anthropic": "claude-sonnet-5", "openai": "gpt-4o-mini",
              "gemini": "gemini-2.0-flash", "grok": "grok-2-latest", "ollama": "llama3.1"}
    provider = settings.llm_provider
    return ResolvedConfig(provider=provider, model_name=models.get(provider, "claude-sonnet-5"),
                          confidence_threshold=0.7)


def clear_config_cache() -> None:
    _config_cache.clear()


# ── high-level calls (record usage) ──────────────────────────────────────────
async def complete(session: AsyncSession, tenant_id, capability: str, *,
                   messages: list[LLMMessage]) -> LLMResponse:
    config = await resolve_config(session, tenant_id, capability)
    provider = _provider_for(config)
    try:
        import asyncio

        response = await asyncio.to_thread(
            provider.complete, messages, model=config.model_name, **config.params)
    except Exception as exc:  # noqa: BLE001
        raise ExternalServiceError(f"LLM call failed: {exc}", code="LLM_FAILED") from exc
    await _record_usage(session, tenant_id, capability, config, provider, response)
    return response


async def structured_complete(session: AsyncSession, tenant_id, capability: str, *,
                              system: str, user: str, schema_hint: str,
                              retries: int = 1) -> dict:
    """Ask for JSON matching a schema; parse + retry once on invalid JSON."""
    base = LLMMessage(role="system",
                      content=f"{system}\nReturn ONLY valid JSON matching:\n{schema_hint}\n"
                              "No prose, no markdown fences.")
    attempt = 0
    last_text = ""
    while attempt <= retries:
        messages = [base, LLMMessage(role="user", content=user)]
        if attempt > 0:
            messages.append(LLMMessage(role="user",
                                       content="Your previous reply was not valid JSON. Return ONLY JSON."))
        resp = await complete(session, tenant_id, capability, messages=messages)
        last_text = resp.text
        parsed = _extract_json(resp.text)
        if parsed is not None:
            return parsed
        attempt += 1
    log.warning("structured_output_unparseable", capability=capability, sample=last_text[:200])
    return {}


def _extract_json(text: str) -> dict | None:
    text = text.strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
    try:
        value = json.loads(text)
        return value if isinstance(value, dict) else {"data": value}
    except (ValueError, TypeError):
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except (ValueError, TypeError):
                return None
        return None


def compute_cost_usd(config: ResolvedConfig, prompt_tokens: int, completion_tokens: int) -> float:
    """Cost from the model config's DB prices (USD per 1M tokens). Never a constant."""
    return round(
        prompt_tokens / 1_000_000 * config.price_input_usd
        + completion_tokens / 1_000_000 * config.price_output_usd, 6)


async def _record_usage(session, tenant_id, capability, config: ResolvedConfig,
                        provider: LLMProvider, response: LLMResponse,
                        *, cache_hit: bool = False) -> None:
    from app.modules.ai.models import AIUsage

    cost = compute_cost_usd(config, response.prompt_tokens, response.completion_tokens)
    session.add(AIUsage(
        tenant_id=uuid.UUID(str(tenant_id)) if tenant_id else None, user_id=None,
        feature=capability, provider=provider.name, model_config_id=config.config_id,
        model_name=response.model, prompt_tokens=response.prompt_tokens,
        completion_tokens=response.completion_tokens, cost_usd=cost,
        latency_ms=response.latency_ms, cache_hit=cache_hit))
    await session.flush()

    # Prometheus: LLM tokens + latency by capability/provider (docs/02 §29).
    if settings.metrics_enabled:
        from app.core import metrics

        metrics.observe_llm(
            capability, provider.name, response.prompt_tokens,
            response.completion_tokens, response.latency_ms,
        )
