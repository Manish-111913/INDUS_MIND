"""Prometheus metrics (docs/02 §29 — Monitoring).

Exposes the four metric families the spec calls for:

  * request rate / latency / error by route  → API process, hooked into
    ``RequestContextMiddleware`` (``observe_request``)
  * queue depth                              → sampled from the Redis broker lists
    at scrape time (``sample_queue_depths``); reflects real worker backlog
  * task duration by task                    → Celery ``task_prerun``/``postrun``/
    ``failure`` signals (``init_celery_metrics``), exposed by the worker's own
    exporter (``start_worker_exporter``)
  * LLM tokens + latency by capability       → recorded from ``llm._record_usage``
    (``observe_llm``)

The API scrapes its own ``/metrics``; the worker runs a tiny HTTP exporter (port
``settings.metrics_port``) so Prometheus can scrape both targets — the standard
per-process exporter pattern. Route labels use the matched *template*
(``/documents/{document_id}``) not the raw path, so cardinality stays bounded.
"""

from __future__ import annotations

from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("core.metrics")

# ── metric families ──────────────────────────────────────────────────────────
_LATENCY_BUCKETS = (0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0)

HTTP_REQUESTS = Counter(
    "indusmind_http_requests_total",
    "HTTP requests by method, matched route template and status code.",
    ["method", "route", "status"],
)
HTTP_LATENCY = Histogram(
    "indusmind_http_request_duration_seconds",
    "HTTP request latency by method and matched route template.",
    ["method", "route"],
    buckets=_LATENCY_BUCKETS,
)
LLM_TOKENS = Counter(
    "indusmind_llm_tokens_total",
    "LLM tokens consumed by capability, provider and kind (prompt|completion).",
    ["capability", "provider", "kind"],
)
LLM_LATENCY = Histogram(
    "indusmind_llm_request_duration_seconds",
    "LLM call latency by capability and provider.",
    ["capability", "provider"],
    buckets=_LATENCY_BUCKETS,
)
CELERY_TASK_LATENCY = Histogram(
    "indusmind_celery_task_duration_seconds",
    "Celery task execution time by task name.",
    ["task"],
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300),
)
CELERY_TASKS = Counter(
    "indusmind_celery_tasks_total",
    "Celery task outcomes by task name and terminal state (success|failure).",
    ["task", "state"],
)
QUEUE_DEPTH = Gauge(
    "indusmind_queue_depth",
    "Pending messages per Celery queue (sampled from the Redis broker at scrape).",
    ["queue"],
)

# Celery broker queues (Redis list keys) — see app/workers/celery_app.py.
_QUEUES = ("ingestion", "ai", "notify", "scheduled", "default")


# ── recording helpers ────────────────────────────────────────────────────────
def observe_request(method: str, route: str, status: int, duration_s: float) -> None:
    HTTP_REQUESTS.labels(method=method, route=route, status=str(status)).inc()
    HTTP_LATENCY.labels(method=method, route=route).observe(duration_s)


def observe_llm(
    capability: str, provider: str, prompt_tokens: int, completion_tokens: int, latency_ms: float
) -> None:
    LLM_TOKENS.labels(capability=capability, provider=provider, kind="prompt").inc(prompt_tokens)
    LLM_TOKENS.labels(capability=capability, provider=provider, kind="completion").inc(
        completion_tokens
    )
    LLM_LATENCY.labels(capability=capability, provider=provider).observe(max(latency_ms, 0) / 1000.0)


def route_template(request) -> str:
    """Matched route template (bounded cardinality); 'unmatched' for 404s."""
    route = request.scope.get("route")
    return getattr(route, "path", None) or "unmatched"


async def sample_queue_depths() -> None:
    """Refresh the queue-depth gauge from the Redis broker (called at scrape)."""
    try:
        from app.core.redis import get_redis

        redis = get_redis()
        for queue in _QUEUES:
            depth = await redis.llen(queue)
            QUEUE_DEPTH.labels(queue=queue).set(depth or 0)
    except Exception as exc:  # noqa: BLE001 — metrics must never break the scrape
        log.warning("queue_depth_sample_failed", error=str(exc))


async def render_metrics() -> tuple[bytes, str]:
    """Sample point-in-time gauges, then serialise the registry for /metrics."""
    await sample_queue_depths()
    return generate_latest(), CONTENT_TYPE_LATEST


# ── Celery wiring ─────────────────────────────────────────────────────────────
def init_celery_metrics() -> None:
    """Connect Celery signals so the worker records task duration + outcome.

    Times are stored on the task request object between pre/post-run. Idempotent.
    """
    import time

    from celery.signals import task_failure, task_postrun, task_prerun, worker_ready

    @task_prerun.connect(weak=False)
    def _prerun(task_id=None, task=None, **_kw):  # pragma: no cover — worker runtime
        if task is not None:
            task.request.__dict__["_metric_start"] = time.perf_counter()

    @task_postrun.connect(weak=False)
    def _postrun(task_id=None, task=None, state=None, **_kw):  # pragma: no cover
        start = getattr(task, "request", None) and task.request.__dict__.get("_metric_start")
        name = getattr(task, "name", "unknown")
        if start is not None:
            CELERY_TASK_LATENCY.labels(task=name).observe(time.perf_counter() - start)
        CELERY_TASKS.labels(task=name, state=(state or "unknown").lower()).inc()

    @task_failure.connect(weak=False)
    def _failure(sender=None, **_kw):  # pragma: no cover
        name = getattr(sender, "name", "unknown")
        CELERY_TASKS.labels(task=name, state="failure").inc()

    @worker_ready.connect(weak=False)
    def _ready(**_kw):  # pragma: no cover — worker runtime
        start_worker_exporter()


def start_worker_exporter() -> None:
    """Expose worker-process metrics on settings.metrics_port (best-effort)."""
    if not settings.metrics_enabled:
        return
    try:
        from prometheus_client import start_http_server

        start_http_server(settings.metrics_port)
        log.info("worker_metrics_exporter_started", port=settings.metrics_port)
    except Exception as exc:  # noqa: BLE001 — never crash the worker on a bind clash
        log.warning("worker_metrics_exporter_failed", error=str(exc))
