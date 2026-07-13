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
        config=Config(signature_version="s3v4"),
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
