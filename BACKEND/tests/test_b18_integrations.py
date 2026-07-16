"""B18 / docs-05 S8 — API keys (auth + scopes) and webhooks (signature + retries)."""

from __future__ import annotations

import hashlib
import hmac
import uuid
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import select

from app.core.database import SessionFactory
from app.modules.integrations import keys_service, webhooks_service
from app.modules.tenants.models import Tenant
from seeds.seed import DEMO_PASSWORD
from seeds.seed import run as seed_run


async def _token(client: httpx.AsyncClient, email: str = "admin@indusmind.io") -> str:
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    return r.json()["data"]["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── key generation / hashing ─────────────────────────────────────────────────
def test_generated_key_shape_and_hash():
    plaintext, prefix, key_hash = keys_service.generate_key()

    assert plaintext.startswith("imk_live_")
    assert prefix == plaintext[:16] and plaintext.startswith(prefix)
    # The stored hash must be SHA-256 of the whole plaintext, not of the prefix.
    assert key_hash == hashlib.sha256(plaintext.encode()).hexdigest()
    assert len(key_hash) == 64
    # The prefix is a display fragment and must not leak the secret.
    assert len(prefix) < len(plaintext)


def test_generated_keys_are_unique():
    keys = {keys_service.generate_key()[0] for _ in range(50)}
    assert len(keys) == 50


# ── retry schedule ───────────────────────────────────────────────────────────
def test_retry_schedule_matches_the_spec():
    """Spec: 1m / 5m / 25m / 2h / 12h, then dead-letter."""
    assert webhooks_service.RETRY_SCHEDULE == (
        timedelta(minutes=1), timedelta(minutes=5), timedelta(minutes=25),
        timedelta(hours=2), timedelta(hours=12),
    )


def test_next_retry_at_walks_the_schedule_then_gives_up():
    now = datetime(2026, 7, 16, 12, 0, tzinfo=UTC)
    expected = [timedelta(minutes=1), timedelta(minutes=5), timedelta(minutes=25),
                timedelta(hours=2), timedelta(hours=12)]
    for attempts, delta in enumerate(expected, start=1):
        assert webhooks_service.next_retry_at(attempts, now=now) == now + delta
    # Past the last step there is no next retry — the row dead-letters.
    assert webhooks_service.next_retry_at(len(expected) + 1, now=now) is None
    assert webhooks_service.next_retry_at(0, now=now) is None


# ── signature ────────────────────────────────────────────────────────────────
def test_signature_is_hmac_sha256_of_the_exact_body_bytes():
    payload = {"event": "failure.recorded", "data": {"id": 1}}
    body = webhooks_service.serialize(payload)
    signature = webhooks_service.sign("s3cret", body)

    assert signature == hmac.new(b"s3cret", body, hashlib.sha256).hexdigest()
    # A subscriber must be able to recompute it from the received bytes.
    assert webhooks_service.sign("s3cret", body) == signature
    assert webhooks_service.sign("wrong", body) != signature


def test_serialization_is_stable_so_signatures_verify():
    """Key order must not change the bytes, or a re-serialized body would fail
    verification on the subscriber's side."""
    a = webhooks_service.serialize({"b": 2, "a": 1})
    b = webhooks_service.serialize({"a": 1, "b": 2})
    assert a == b


# ── API key auth path ────────────────────────────────────────────────────────
async def _make_key(client, token, scopes: list[str], name: str = "test-key") -> str:
    r = await client.post("/api/v1/admin/api-keys",
                          json={"name": name, "scopes": scopes}, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()["data"]["key"]


async def test_create_returns_plaintext_once_and_never_again(db, client):
    await seed_run()
    token = await _token(client)
    created = (await client.post("/api/v1/admin/api-keys",
                                 json={"name": "sap-pm", "scopes": ["equip.read"]},
                                 headers=_auth(token))).json()["data"]

    assert created["key"].startswith("imk_live_")
    # The list view must never carry the plaintext back.
    listed = (await client.get("/api/v1/admin/api-keys", headers=_auth(token))).json()["data"]
    row = next(k for k in listed if k["id"] == created["id"])
    assert "key" not in row
    assert row["key_prefix"] == created["key"][:16]


async def test_plaintext_is_not_stored_anywhere(db, client):
    """A database leak must not yield a usable credential."""
    await seed_run()
    token = await _token(client)
    plaintext = await _make_key(client, token, ["equip.read"])

    async with SessionFactory() as s:
        row = (await s.execute(select(keys_service.ApiKey))).scalars().first()
    assert row.key_hash == hashlib.sha256(plaintext.encode()).hexdigest()
    assert plaintext not in (row.key_hash, row.key_prefix)


async def test_api_key_authenticates_as_an_alternative_principal(db, client):
    await seed_run()
    token = await _token(client)
    plaintext = await _make_key(client, token, ["equip.read"])

    # No bearer token at all — the key alone must authenticate.
    r = await client.get("/api/v1/equipment?limit=1", headers={"X-API-Key": plaintext})
    assert r.status_code == 200


async def test_api_key_scopes_are_the_permission_set(db, client):
    """A key holding equip.read must not reach a docs.* route."""
    await seed_run()
    token = await _token(client)
    plaintext = await _make_key(client, token, ["equip.read"])

    assert (await client.get("/api/v1/equipment?limit=1",
                             headers={"X-API-Key": plaintext})).status_code == 200
    r = await client.get("/api/v1/admin/api-keys", headers={"X-API-Key": plaintext})
    assert r.status_code == 403, "key without integrations.manage reached the admin surface"


async def test_unknown_and_revoked_keys_are_rejected(db, client):
    await seed_run()
    token = await _token(client)
    plaintext = await _make_key(client, token, ["equip.read"])
    key_id = (await client.get("/api/v1/admin/api-keys",
                               headers=_auth(token))).json()["data"][0]["id"]

    assert (await client.get("/api/v1/equipment",
                             headers={"X-API-Key": "imk_live_bogus"})).status_code == 401
    # Not even a well-formed key from another namespace.
    assert (await client.get("/api/v1/equipment",
                             headers={"X-API-Key": "nope"})).status_code == 401

    await client.delete(f"/api/v1/admin/api-keys/{key_id}", headers=_auth(token))
    r = await client.get("/api/v1/equipment", headers={"X-API-Key": plaintext})
    assert r.status_code == 401, "revoked key still authenticates"


async def test_expired_key_is_rejected(db, client):
    await seed_run()
    token = await _token(client)
    plaintext = await _make_key(client, token, ["equip.read"])

    async with SessionFactory() as s:
        row = (await s.execute(select(keys_service.ApiKey))).scalars().first()
        row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        await s.commit()

    assert (await client.get("/api/v1/equipment",
                             headers={"X-API-Key": plaintext})).status_code == 401


async def test_key_cannot_be_granted_unknown_or_escalated_scopes(db, client):
    await seed_run()
    token = await _token(client)

    r = await client.post("/api/v1/admin/api-keys",
                          json={"name": "bad", "scopes": ["not.a.permission"]},
                          headers=_auth(token))
    assert r.status_code == 422

    # An engineer cannot mint a key carrying a permission they don't hold.
    eng = await _token(client, "engineer@indusmind.io")
    r = await client.post("/api/v1/admin/api-keys", json={"name": "x", "scopes": ["role.manage"]},
                          headers=_auth(eng))
    assert r.status_code in (403, 422)


async def test_last_used_at_is_touched_but_throttled(db, client):
    await seed_run()
    token = await _token(client)
    plaintext = await _make_key(client, token, ["equip.read"])

    await client.get("/api/v1/equipment?limit=1", headers={"X-API-Key": plaintext})
    async with SessionFactory() as s:
        first = (await s.execute(select(keys_service.ApiKey))).scalars().first().last_used_at
    assert first is not None

    # A second call inside the throttle window must not write again.
    await client.get("/api/v1/equipment?limit=1", headers={"X-API-Key": plaintext})
    async with SessionFactory() as s:
        second = (await s.execute(select(keys_service.ApiKey))).scalars().first().last_used_at
    assert second == first, "last_used_at wrote on every request — throttle is not working"


# ── webhook endpoints + delivery ─────────────────────────────────────────────
async def test_endpoint_create_returns_secret_and_rejects_non_http(db, client):
    await seed_run()
    token = await _token(client)

    r = await client.post("/api/v1/admin/webhooks",
                          json={"name": "sap", "url": "https://example.test/hook",
                                "event_codes": ["failure.recorded"]}, headers=_auth(token))
    assert r.status_code == 201
    assert len(r.json()["data"]["secret"]) > 20

    bad = await client.post("/api/v1/admin/webhooks",
                            json={"name": "x", "url": "file:///etc/passwd",
                                  "event_codes": ["failure.recorded"]}, headers=_auth(token))
    assert bad.status_code == 422


async def _tenant_id() -> uuid.UUID:
    async with SessionFactory() as s:
        return (await s.execute(select(Tenant))).scalars().first().id


async def test_delivery_signs_body_and_marks_delivered(db, client, monkeypatch):
    await seed_run()
    tenant_id = await _tenant_id()
    captured: dict = {}

    class _Resp:
        status_code, text = 200, "ok"

    class _Client:
        def __init__(self, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, content=None, headers=None):
            captured.update(url=url, content=content, headers=headers)
            return _Resp()

    monkeypatch.setattr(webhooks_service, "http_client_factory", _Client)

    async with SessionFactory() as s:
        svc = webhooks_service.WebhookService(s, tenant_id)
        ep = await svc.create_endpoint(name="e", url="https://example.test/h",
                                       event_codes=["failure.recorded"], actor_id=None)
        d = await svc.enqueue(ep, "failure.recorded", {"id": "1"})
        await svc.attempt(d)
        await s.commit()
        secret = ep.secret
        assert d.status == "delivered" and d.attempts == 1 and d.delivered_at is not None

    # The subscriber must be able to verify the signature over the received bytes.
    expected = hmac.new(secret.encode(), captured["content"], hashlib.sha256).hexdigest()
    assert captured["headers"][webhooks_service.SIGNATURE_HEADER] == expected
    assert captured["headers"][webhooks_service.EVENT_HEADER] == "failure.recorded"


async def test_failed_delivery_schedules_a_retry_then_dead_letters(db, client, monkeypatch):
    await seed_run()
    tenant_id = await _tenant_id()

    class _Client:
        def __init__(self, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            raise httpx.ConnectError("refused")

    monkeypatch.setattr(webhooks_service, "http_client_factory", _Client)

    async with SessionFactory() as s:
        svc = webhooks_service.WebhookService(s, tenant_id)
        ep = await svc.create_endpoint(name="e", url="https://down.test/h",
                                       event_codes=["failure.recorded"], actor_id=None)
        d = await svc.enqueue(ep, "failure.recorded", {"id": "1"})

        # Each failure walks one step down the schedule and stays retryable...
        for expected_attempt in range(1, webhooks_service.MAX_ATTEMPTS):
            await svc.attempt(d)
            assert d.attempts == expected_attempt
            assert d.status == "retrying", f"attempt {expected_attempt} should stay retryable"
            assert d.next_retry_at is not None
            assert "ConnectError" in d.error

        # ...until the budget is exhausted, when it dead-letters.
        await svc.attempt(d)
        assert d.status == "failed"
        assert d.next_retry_at is None, "a dead-lettered delivery must not stay due"
        await s.commit()


async def test_a_transport_failure_never_raises(db, client, monkeypatch):
    """A dead subscriber is an expected state — it must be recorded, not thrown."""
    await seed_run()
    tenant_id = await _tenant_id()

    class _Client:
        def __init__(self, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            raise httpx.ConnectTimeout("timeout")

    monkeypatch.setattr(webhooks_service, "http_client_factory", _Client)
    async with SessionFactory() as s:
        svc = webhooks_service.WebhookService(s, tenant_id)
        ep = await svc.create_endpoint(name="e", url="https://slow.test/h",
                                       event_codes=["x"], actor_id=None)
        d = await svc.enqueue(ep, "x", {})
        await svc.attempt(d)  # must not raise
        assert d.status == "retrying" and d.response_code is None
        await s.commit()


async def test_enqueue_for_event_only_matches_subscribed_active_endpoints(db, client):
    await seed_run()
    tenant_id = await _tenant_id()
    async with SessionFactory() as s:
        svc = webhooks_service.WebhookService(s, tenant_id)
        wanted = await svc.create_endpoint(name="wanted", url="https://a.test/h",
                                           event_codes=["failure.recorded"], actor_id=None)
        await svc.create_endpoint(name="other", url="https://b.test/h",
                                  event_codes=["workorder.created"], actor_id=None)
        inactive = await svc.create_endpoint(name="off", url="https://c.test/h",
                                             event_codes=["failure.recorded"], actor_id=None)
        inactive.is_active = False
        await s.flush()

        deliveries = await svc.enqueue_for_event("failure.recorded", {"id": "1"})
        await s.commit()

    assert [d.endpoint_id for d in deliveries] == [wanted.id]


async def test_integrations_surface_requires_the_permission(db, client):
    await seed_run()
    tech = await _token(client, "technician@indusmind.io")
    for path in ("/api/v1/admin/api-keys", "/api/v1/admin/webhooks",
                 "/api/v1/admin/webhooks/deliveries"):
        assert (await client.get(path, headers=_auth(tech))).status_code == 403, path
