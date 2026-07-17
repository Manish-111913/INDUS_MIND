"""Rate limiting — Redis sliding-window log (docs/02 §40).

Per user+route-class limits: auth 20/min/IP · /ai/* + chat 20/min/user ·
uploads 30/hour/user · exports 10/hour/user · general 120/min/user.
Exceeding → 429 + Retry-After.
Enabled via RATE_LIMIT_ENABLED (off in tests; a unit test covers the limiter).
"""

from __future__ import annotations

import math
import time

import jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import settings
from app.core.logging import get_logger, request_id_ctx
from app.core.redis import get_redis
from app.core.security import decode_jwt

log = get_logger("core.ratelimit")


class RateLimiter:
    async def check(self, key: str, limit: int, window: int) -> tuple[bool, int]:
        """Sliding-window log. Returns (allowed, retry_after_seconds)."""
        redis = get_redis()
        now = time.time()
        member = f"{time.time_ns()}"
        cutoff = now - window
        pipe = redis.pipeline()
        pipe.zremrangebyscore(key, 0, cutoff)
        pipe.zadd(key, {member: now})
        pipe.zcard(key)
        pipe.expire(key, window)
        _, _, count, _ = await pipe.execute()
        if count > limit:
            await redis.zrem(key, member)  # don't count the rejected request
            oldest = await redis.zrange(key, 0, 0, withscores=True)
            retry_after = math.ceil(window - (now - float(oldest[0][1]))) if oldest else window
            return False, max(1, retry_after)
        return True, 0


limiter = RateLimiter()


def _class_for(request: Request) -> tuple[str, int, int, bool]:
    """Return (name, limit, window_seconds, per_ip)."""
    path, method = request.url.path, request.method
    if path.startswith("/api/v1/auth"):
        return "auth", 20, 60, True
    if path.startswith("/api/v1/ai") or path.startswith("/api/v1/chat"):
        return "ai", 20, 60, False
    if method == "POST" and (path.endswith("/upload-url") or path.endswith("/versions")):
        return "upload", 30, 3600, False
    if method == "POST" and (path.endswith("/export") or path.endswith("/evidence-packages")):
        return "export", 10, 3600, False
    return "general", 120, 60, False


def _identity(request: Request, per_ip: bool) -> str:
    ip = request.client.host if request.client else "unknown"
    if per_ip:
        return f"ip:{ip}"
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        try:
            claims = decode_jwt(header[7:])
            return f"user:{claims.get('sub')}"
        except jwt.PyJWTError:
            pass
    return f"ip:{ip}"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not settings.rate_limit_enabled or not request.url.path.startswith("/api/"):
            return await call_next(request)

        name, limit, window, per_ip = _class_for(request)
        identity = _identity(request, per_ip)
        key = f"ratelimit:{name}:{identity}"
        try:
            allowed, retry_after = await limiter.check(key, limit, window)
        except Exception as exc:  # noqa: BLE001 — never fail-closed on a Redis blip
            log.warning("ratelimit_check_failed", error=str(exc))
            return await call_next(request)

        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"error": {"code": "RATE_LIMITED",
                                   "message": f"Rate limit exceeded for {name} requests",
                                   "request_id": request_id_ctx.get()}},
                headers={"Retry-After": str(retry_after)})
        return await call_next(request)
