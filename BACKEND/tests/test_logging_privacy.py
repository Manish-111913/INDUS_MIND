"""Logging-privacy tests (docs/02 §28 — "bodies excluded; PII never logged").

structlog renders JSON to stdout at INFO in every environment (LLM prompt bodies
are logged at DEBUG only, so they never appear at INFO). These tests drive real
requests carrying a unique marker and capture stdout at the file-descriptor level
(``capfd``) — exactly what a log shipper would collect — then assert the marker
never appears: no request/response bodies, no PII, no prompt text leaks.
"""

from __future__ import annotations

import uuid

from seeds.seed import DEMO_PASSWORD
from seeds.seed import run as seed_run


async def test_request_body_and_pii_not_logged_at_info(db, client, capfd):
    """A login payload (email PII + password) must not surface in INFO logs."""
    capfd.readouterr()  # drain anything logged during setup
    marker_email = f"leak-probe-{uuid.uuid4().hex}@secret.example"
    marker_password = f"P-ass-{uuid.uuid4().hex}"

    # Invalid credentials → 401, but the body is still parsed and handled.
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": marker_email, "password": marker_password},
    )
    assert resp.status_code in (401, 422), resp.text

    out, err = capfd.readouterr()
    combined = out + err
    # Guard against a vacuous pass: the middleware request log (uniquely carrying
    # `duration_ms`) WAS captured, so the marker assertions below are meaningful.
    # (Format-agnostic: works whether structlog renders JSON or console.)
    assert "duration_ms" in combined, (
        "no middleware request log captured — privacy assertion would be vacuous"
    )
    assert marker_email not in combined, "email PII leaked into INFO logs"
    assert marker_password not in combined, "password leaked into INFO logs"


async def test_llm_query_text_not_logged_at_info(db, client, capfd):
    """A copilot query's text (the prompt / user content) must not leak at INFO."""
    await seed_run()
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@indusmind.io", "password": DEMO_PASSWORD},
    )
    token = login.json()["data"]["access_token"]
    marker = f"canary-{uuid.uuid4().hex}-what-is-the-seal-flush-plan"

    capfd.readouterr()  # drain login/seed noise
    resp = await client.post(
        "/api/v1/ai/query",
        json={"query": marker},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text

    out, err = capfd.readouterr()
    combined = out + err
    assert "duration_ms" in combined, (
        "no middleware request log captured — privacy assertion would be vacuous"
    )
    assert marker not in combined, "user query / prompt text leaked into INFO logs"
