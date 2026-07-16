"""LLM provider registry — key gating, dispatch and per-provider dialects.

These tests never make a network call: they assert which provider class the
registry *selects* and how each one shapes its request, so the Gemini/Grok
wiring is verified without an API account.
"""

from __future__ import annotations

import pytest

from app.core import llm

HOSTED = ["anthropic", "openai", "gemini", "grok"]


def _no_keys(monkeypatch):
    for attr in ("anthropic_api_key", "openai_api_key", "gemini_api_key", "grok_api_key"):
        monkeypatch.setattr(llm.settings, attr, "")


@pytest.mark.parametrize("provider", HOSTED)
def test_hosted_provider_without_key_falls_back_to_mock(provider, monkeypatch):
    _no_keys(monkeypatch)
    assert llm.provider_key_present(provider) is False
    assert isinstance(llm._provider_for(llm.ResolvedConfig(provider=provider, model_name="m")),
                      llm.MockProvider)


@pytest.mark.parametrize(("provider", "setting", "expected"), [
    ("anthropic", "anthropic_api_key", llm.AnthropicProvider),
    ("openai", "openai_api_key", llm.OpenAIProvider),
    ("gemini", "gemini_api_key", llm.GeminiProvider),
    ("grok", "grok_api_key", llm.GrokProvider),
])
def test_hosted_provider_with_key_dispatches_to_real_provider(provider, setting, expected, monkeypatch):
    _no_keys(monkeypatch)
    monkeypatch.setattr(llm.settings, setting, "test-key")
    assert llm.provider_key_present(provider) is True
    assert isinstance(llm._provider_for(llm.ResolvedConfig(provider=provider, model_name="m")), expected)


def test_ollama_needs_no_key_but_needs_a_url(monkeypatch):
    monkeypatch.setattr(llm.settings, "ollama_url", "http://localhost:11434")
    assert llm.provider_key_present("ollama") is True
    monkeypatch.setattr(llm.settings, "ollama_url", "")
    assert llm.provider_key_present("ollama") is False


def test_unknown_provider_falls_back_to_mock():
    assert llm.provider_key_present("does-not-exist") is False
    assert isinstance(llm._provider_for(llm.ResolvedConfig(provider="does-not-exist", model_name="m")),
                      llm.MockProvider)


def test_grok_reuses_the_openai_dialect_with_the_xai_endpoint(monkeypatch):
    """Grok is an OpenAIProvider subclass; only credential + base URL differ."""
    monkeypatch.setattr(llm.settings, "grok_api_key", "xai-key")
    monkeypatch.setattr(llm.settings, "openai_api_key", "oai-key")
    monkeypatch.setattr(llm.settings, "grok_base_url", "https://api.x.ai/v1")

    grok, openai = llm.GrokProvider(), llm.OpenAIProvider()
    assert isinstance(grok, llm.OpenAIProvider)
    assert (grok._api_key(), grok._base_url()) == ("xai-key", "https://api.x.ai/v1")
    # OpenAI must keep the SDK default endpoint, not inherit xAI's.
    assert (openai._api_key(), openai._base_url()) == ("oai-key", None)


@pytest.mark.parametrize(("provider", "model"), [
    ("anthropic", "claude-sonnet-5"), ("openai", "gpt-4o-mini"),
    ("gemini", "gemini-2.0-flash"), ("grok", "grok-2-latest"), ("ollama", "llama3.1"),
])
def test_default_config_model_per_provider(provider, model, monkeypatch):
    """Every selectable provider needs a default model — a missing entry would
    silently resolve to the Anthropic default and call it on the wrong API."""
    monkeypatch.setattr(llm.settings, "llm_provider", provider)
    cfg = llm._default_config("chat")
    assert (cfg.provider, cfg.model_name) == (provider, model)


def test_gemini_hoists_system_prompt_and_maps_assistant_role(monkeypatch):
    """Gemini takes the system prompt out-of-band and names the assistant turn
    'model'; a plain OpenAI-style passthrough would be rejected by the API."""
    genai = pytest.importorskip("google.genai", reason="google-genai SDK not installed (optional [ai] extra)")

    captured: dict = {}

    class _Models:
        def generate_content(self, *, model, contents, config):
            captured.update(model=model, contents=contents, config=config)
            return type("R", (), {"text": "hi", "usage_metadata": type(
                "U", (), {"prompt_token_count": 11, "candidates_token_count": 5})()})()

    class _Client:
        def __init__(self, *a, **k):
            self.models = _Models()

    monkeypatch.setattr(genai, "Client", _Client)
    monkeypatch.setattr(llm.settings, "gemini_api_key", "g-key")

    resp = llm.GeminiProvider().complete(
        [llm.LLMMessage(role="system", content="SYS"),
         llm.LLMMessage(role="user", content="U1"),
         llm.LLMMessage(role="assistant", content="A1")],
        model="gemini-2.0-flash")

    assert captured["config"].system_instruction == "SYS"
    # system is hoisted out of the turn list; assistant is renamed to "model".
    assert [c.role for c in captured["contents"]] == ["user", "model"]
    assert (resp.text, resp.prompt_tokens, resp.completion_tokens) == ("hi", 11, 5)
