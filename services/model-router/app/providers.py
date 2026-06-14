"""LiteLLM provider adapter.

Based on AF's `scripts/core/agent/llm.py` LiteLLMProvider, extended to also
return token usage + latency (the router needs both for accounting).

The router speaks in *logical* model ids (e.g. ``claude-haiku-4-5``) that resolve
in the cost-tracker pricing table. MODEL_MAP translates those to the
LiteLLM/Anthropic model strings used for the actual call. Unknown ids pass
through unchanged, so any LiteLLM-supported model still works (its pricing just
needs an entry to be costed).
"""
from __future__ import annotations

import time

import litellm

# logical id (matches cost-tracker RATES) -> LiteLLM model string
MODEL_MAP: dict[str, str] = {
    "claude-opus-4-8": "anthropic/claude-opus-4-8",
    "claude-sonnet-4-6": "anthropic/claude-sonnet-4-6",
    "claude-haiku-4-5": "anthropic/claude-haiku-4-5-20251001",
}


def to_litellm_model(logical: str) -> str:
    return MODEL_MAP.get(logical, logical)


def complete(messages: list[dict[str, str]], model: str) -> tuple[str, dict[str, int], float]:
    """Returns (content, {"input": n, "output": n}, latency_ms)."""
    start = time.monotonic()
    response = litellm.completion(model=to_litellm_model(model), messages=messages)
    latency_ms = (time.monotonic() - start) * 1000.0
    content: str = response.choices[0].message.content or ""  # type: ignore[union-attr]
    usage = getattr(response, "usage", None)
    tokens = {
        "input": int(getattr(usage, "prompt_tokens", 0) or 0),
        "output": int(getattr(usage, "completion_tokens", 0) or 0),
    }
    return content, tokens, latency_ms
