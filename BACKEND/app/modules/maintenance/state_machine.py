"""Work-order state machine (docs/02 §7, §18).

Legal transitions: open → in_progress → on_hold/review → closed (plus cancel from
any non-terminal state). Enforced centrally so the router, transition endpoint and
close endpoint all agree; an illegal transition raises ValidationFailed(422) with
an ``ILLEGAL_TRANSITION`` code. Terminal states (closed, cancelled) accept no
further transitions.
"""

from __future__ import annotations

from app.core.exceptions import ValidationFailed

OPEN = "open"
IN_PROGRESS = "in_progress"
ON_HOLD = "on_hold"
REVIEW = "review"
CLOSED = "closed"
CANCELLED = "cancelled"

ALL_STATES: frozenset[str] = frozenset(
    {OPEN, IN_PROGRESS, ON_HOLD, REVIEW, CLOSED, CANCELLED}
)
TERMINAL_STATES: frozenset[str] = frozenset({CLOSED, CANCELLED})

# state → set of states it may move to (docs/02 §7 lifecycle).
_TRANSITIONS: dict[str, frozenset[str]] = {
    OPEN: frozenset({IN_PROGRESS, ON_HOLD, CANCELLED}),
    IN_PROGRESS: frozenset({ON_HOLD, REVIEW, CLOSED, CANCELLED}),
    ON_HOLD: frozenset({IN_PROGRESS, REVIEW, CANCELLED}),
    REVIEW: frozenset({IN_PROGRESS, CLOSED, CANCELLED}),
    CLOSED: frozenset(),
    CANCELLED: frozenset(),
}


def allowed_transitions(state: str) -> frozenset[str]:
    return _TRANSITIONS.get(state, frozenset())


def can_transition(current: str, target: str) -> bool:
    return target in allowed_transitions(current)


def validate_transition(current: str, target: str) -> None:
    """Raise 422 unless ``current → target`` is a legal move."""
    if target not in ALL_STATES:
        raise ValidationFailed(
            f"Unknown work-order status '{target}'", code="VALIDATION_ERROR",
            http_status=422, field_errors={"status": "Unknown status"},
        )
    if current == target:
        raise ValidationFailed(
            f"Work order is already '{current}'", code="ILLEGAL_TRANSITION",
            http_status=422, field_errors={"status": f"Already {current}"},
        )
    if not can_transition(current, target):
        allowed = sorted(allowed_transitions(current))
        raise ValidationFailed(
            f"Illegal transition {current} → {target}", code="ILLEGAL_TRANSITION",
            http_status=422,
            field_errors={"status": f"From '{current}' only {allowed or 'no transitions'} allowed"},
        )
