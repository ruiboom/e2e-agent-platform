"""Auto-feed the cost-tracker via its fire-and-forget Python client.

`track()` never raises and returns immediately (spool + daemon flush), so the
router's latency is unaffected. We compute cost via the same pricing table and
return it on the response too.
"""
from __future__ import annotations

import os

import cost_tracker

_configured = False


def _ensure_configured() -> None:
    global _configured
    if not _configured:
        cost_tracker.configure(
            url=os.environ.get("COST_TRACKER_URL", "http://localhost:8787"),
            app="model-router",
            token=os.environ.get("COST_TRACKER_TOKEN"),
        )
        _configured = True


def record(
    *,
    model: str,
    input_tokens: int,
    output_tokens: int,
    latency_ms: float,
    project_id: str | None,
    prompt_key: str | None,
    prompt_version: int | None,
) -> float:
    """Record one LLM turn; return the estimated USD cost (0.0 if model unknown)."""
    _ensure_configured()
    cost = cost_tracker.estimate_cost(model, input_tokens, output_tokens)
    cost_tracker.track(
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=cost,
        session_id=project_id,
        meta={
            "prompt_key": prompt_key,
            "prompt_version": prompt_version,
            "latency_ms": round(latency_ms),
        },
    )
    return float(cost or 0.0)
