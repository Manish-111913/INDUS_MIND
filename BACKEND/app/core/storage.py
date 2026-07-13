"""S3-compatible object storage adapter (MinIO local / S3 prod) — docs/02 §12.

Same code path for MinIO and S3. Uploads use server-issued pre-signed PUT;
reads use short-lived pre-signed GET. Key convention:
    tenant/{tid}/documents/{doc_id}/v{n}/original.{ext}
    tenant/{tid}/documents/{doc_id}/thumbnails/page-{n}.webp
    tenant/{tid}/evidence/{pkg_id}.zip
"""

from __future__ import annotations

from functools import lru_cache

import boto3
from botocore.client import Config

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("core.storage")

_PRESIGN_TTL = 900  # 15 min (docs/02 §12)


@lru_cache
def _client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.aws_region,
        # path-style addressing is required for MinIO presigned URLs
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def presigned_put(key: str, content_type: str | None = None, ttl: int = _PRESIGN_TTL) -> str:
    params: dict = {"Bucket": settings.s3_bucket, "Key": key}
    if content_type:
        params["ContentType"] = content_type
    return _client().generate_presigned_url("put_object", Params=params, ExpiresIn=ttl)


def presigned_get(key: str, ttl: int = _PRESIGN_TTL) -> str:
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=ttl,
    )


def object_exists(key: str) -> bool:
    from botocore.exceptions import ClientError

    try:
        _client().head_object(Bucket=settings.s3_bucket, Key=key)
        return True
    except ClientError:
        return False


def stat_object(key: str) -> dict | None:
    """Return {size, content_type} for an object, or None if it doesn't exist."""
    from botocore.exceptions import ClientError

    try:
        resp = _client().head_object(Bucket=settings.s3_bucket, Key=key)
        return {"size": resp["ContentLength"], "content_type": resp.get("ContentType")}
    except ClientError:
        return None


def read_prefix(key: str, n: int = 2048) -> bytes:
    """Read the first n bytes (range GET) — used for server-side MIME sniffing."""
    resp = _client().get_object(Bucket=settings.s3_bucket, Key=key, Range=f"bytes=0-{n - 1}")
    return resp["Body"].read()


def read_object(key: str) -> bytes:
    """Read a whole object into memory (used by the ingestion pipeline)."""
    resp = _client().get_object(Bucket=settings.s3_bucket, Key=key)
    return resp["Body"].read()


def put_object(key: str, data: bytes, content_type: str | None = None) -> None:
    """Server-side write (thumbnails, seed uploads, evidence packages)."""
    extra = {"ContentType": content_type} if content_type else {}
    _client().put_object(Bucket=settings.s3_bucket, Key=key, Body=data, **extra)


def compute_sha256(key: str) -> str:
    """Stream the object and return its SHA-256 hex (checksum verification, §12)."""
    import hashlib

    resp = _client().get_object(Bucket=settings.s3_bucket, Key=key)
    digest = hashlib.sha256()
    for chunk in resp["Body"].iter_chunks(1 << 16):
        digest.update(chunk)
    return digest.hexdigest()


def sniff_mime(buf: bytes) -> str | None:
    """Detect MIME from bytes via libmagic. Returns None if libmagic isn't available
    (best-effort — the Docker images install libmagic; local dev may not have it)."""
    try:
        import magic
    except Exception:  # noqa: BLE001 — ImportError or libmagic load failure
        log.warning("libmagic_unavailable_skipping_mime_sniff")
        return None
    try:
        return magic.from_buffer(buf, mime=True)
    except Exception as exc:  # noqa: BLE001
        log.warning("mime_sniff_failed", error=str(exc))
        return None


def ping() -> bool:
    """Readiness helper — confirm the bucket is reachable."""
    _client().head_bucket(Bucket=settings.s3_bucket)
    return True


# ── Key builders (single place so prefixes never drift) ──────────────────────
def document_key(tenant_id: str, doc_id: str, version: int, filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
    return f"tenant/{tenant_id}/documents/{doc_id}/v{version}/original.{ext}"


def thumbnail_key(tenant_id: str, doc_id: str, page: int) -> str:
    return f"tenant/{tenant_id}/documents/{doc_id}/thumbnails/page-{page}.webp"


def evidence_key(tenant_id: str, pkg_id: str) -> str:
    return f"tenant/{tenant_id}/evidence/{pkg_id}.zip"
