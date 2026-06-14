"""Shared RAG steps (retrieve / generate) used by both the inline runtime and
the LangGraph runtime, so the two paradigms execute the same logic."""
from __future__ import annotations

import os
from typing import Any

import httpx

GROUND_URL = os.environ.get("GROUND_URL", "http://localhost:8790").rstrip("/")
ROUTER_URL = os.environ.get("MODEL_ROUTER_URL", "http://localhost:8789").rstrip("/")


def retrieve(project_id: str, release_key: str, question: str, k: int, mode: str) -> list[dict[str, Any]]:
    with httpx.Client(timeout=60.0) as client:
        r = client.post(f"{GROUND_URL}/v1/retrieve",
                        json={"project_id": project_id, "release_key": release_key, "query": question, "k": k, "mode": mode})
        r.raise_for_status()
        return r.json()["chunks"]


def build_context(chunks: list[dict[str, Any]]) -> str:
    return "\n\n".join(f"[{c['item_id'][:8]}] {c['body']}" for c in chunks) or "(no context found)"


def generate(project_id: str, system_prompt: str, context: str, question: str) -> dict[str, Any]:
    with httpx.Client(timeout=60.0) as client:
        g = client.post(f"{ROUTER_URL}/v1/route",
                        json={"prompt_key": "agent.answer",
                              "vars": {"system_prompt": system_prompt, "context": context, "question": question},
                              "project_id": project_id})
        g.raise_for_status()
        return g.json()
