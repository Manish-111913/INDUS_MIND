# ── IndusMind API image (multi-stage, slim, non-root) ────────────────────────
FROM python:3.11-slim AS builder
WORKDIR /app
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml ./
RUN pip install --upgrade pip setuptools wheel \
    && pip wheel --wheel-dir /wheels .[dev,native]

FROM python:3.11-slim AS runtime
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
# libmagic1 backs python-magic; the cairo/pango/gdk-pixbuf set backs WeasyPrint.
# Without the latter WeasyPrint imports but cannot render, and reports silently
# degrade to the ReportLab fallback — so the [native] extra and these libs must
# be installed together or not at all.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 curl libmagic1 \
        libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 appuser
COPY --from=builder /wheels /wheels
COPY pyproject.toml ./
RUN pip install --no-cache-dir --no-index --find-links=/wheels .[dev,native] && rm -rf /wheels
COPY . .
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
