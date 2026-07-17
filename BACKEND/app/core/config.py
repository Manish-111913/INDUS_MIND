"""Application settings — pydantic-settings, sourced from env / .env (docs/02 §49).

Nothing behavioural is hardcoded elsewhere; every knob the platform reads at
runtime originates here or in the database (lookups, prompt_templates,
ai_model_configs, dashboard_configs, feature_flags).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── Application ──────────────────────────────────────────────────────────
    app_env: Literal["local", "staging", "prod"] = "local"
    secret_key: str = "change-me-dev-secret"
    log_level: str = "INFO"

    # ── JWT (RS256) ──────────────────────────────────────────────────────────
    jwt_private_key: str = ""
    jwt_public_key: str = ""
    access_token_ttl: int = 900
    refresh_token_ttl: int = 604800

    # ── Datastores ───────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://indusmind:indusmind@localhost:5432/indusmind"
    redis_url: str = "redis://localhost:6379/0"
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "indusmind-neo4j"

    # ── Object storage (MinIO/S3) ────────────────────────────────────────────
    s3_endpoint: str = "http://localhost:9000"
    s3_bucket: str = "indusmind"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    aws_region: str = "us-east-1"

    # ── Provider adapters ────────────────────────────────────────────────────
    llm_provider: Literal["anthropic", "openai", "gemini", "grok", "ollama"] = "anthropic"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    gemini_api_key: str = ""
    grok_api_key: str = ""
    # xAI speaks the OpenAI chat-completions dialect, so GrokProvider subclasses
    # OpenAIProvider and only swaps the key + base URL.
    grok_base_url: str = "https://api.x.ai/v1"
    ollama_url: str = "http://localhost:11434"
    embedding_provider: Literal["local", "openai"] = "local"
    embedding_model: str = "bge-large-en-v1.5"
    # Cosine-similarity floor for a chunk to count as evidence. Only applied when
    # the embedding provider is semantic; the hash fallback's distances are noise.
    retrieval_min_similarity: float = 0.45
    ocr_provider: Literal["paddle", "textract"] = "paddle"

    # ── HTTP / CORS ──────────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:3000"
    frontend_url: str = "http://localhost:3000"

    # ── Rate limiting ────────────────────────────────────────────────────────
    rate_limit_enabled: bool = True

    # ── Self-service registration (docs/02 §24) ──────────────────────────────
    # When enabled, POST /auth/register lets anyone create an account with any
    # email domain. New users join `default_tenant_slug` with the least-privilege
    # `self_signup_role` and are logged in immediately. Turn off for invite-only.
    self_signup_enabled: bool = True
    self_signup_role: str = "Admin"
    default_tenant_slug: str = "indusmind"

    # ── OAuth ────────────────────────────────────────────────────────────────
    oauth_google_client_id: str = ""
    oauth_google_client_secret: str = ""

    # ── Mail ─────────────────────────────────────────────────────────────────
    mail_provider: Literal["smtp", "ses"] = "smtp"  # smtp (mailhog/real) | ses (prod)
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "no-reply@indusmind.local"

    # ── Observability ────────────────────────────────────────────────────────
    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = 0.0
    metrics_enabled: bool = True
    metrics_port: int = 9100  # worker-process Prometheus exporter (docs/02 §29)

    # ── Feature flags default ────────────────────────────────────────────────
    feature_defaults_json: str = "{}"

    @field_validator("cors_origins")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_local(self) -> bool:
        return self.app_env == "local"

    @property
    def embedding_dim(self) -> int:
        # bge-large-en-v1.5 → 1024; document_chunks.embedding VECTOR(1024).
        return 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
