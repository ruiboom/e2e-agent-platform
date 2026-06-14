"""Minimal vector-RAG runtime (Phase 1).

A retrieve -> generate agent. Builds an agent_version from a system_prompt + a
pinned kb_release, and answers chat by retrieving from Ground and calling the
model-router. Every answer carries the provenance tuple
{release_key, agent_version, item_id, revision_id, chunk_id}.

build_paradigm is "code" (a hand-built RAG runtime). Full LangGraph/ADK runtimes
via AF are Phase-4 build breadth; the agent_version contract is identical.
"""
from __future__ import annotations

import os
from typing import Any

import httpx

from lineage import LineageClient

GROUND_URL = os.environ.get("GROUND_URL", "http://localhost:8790").rstrip("/")
ROUTER_URL = os.environ.get("MODEL_ROUTER_URL", "http://localhost:8789").rstrip("/")
DEFAULT_MODEL = os.environ.get("MODEL_ROUTER_DEFAULT_MODEL", "claude-haiku-4-5")

_lineage: LineageClient | None = None


def _lin() -> LineageClient:
    global _lineage
    if _lineage is None:
        _lineage = LineageClient.from_database_url()
    return _lineage


VALID_MODES = {"vector", "lexical", "hybrid", "graph", "graph_hybrid"}

# Authoring surfaces over the same retrieve->generate runtime. Each produces a
# valid agent_version; the runtime behaviour is identical (RAG over the pinned
# release), so every paradigm passes the same chat + eval.
PARADIGM_CONFIG: dict[str, dict[str, Any]] = {
    "code": {},
    "canvas": {"graph": {"nodes": ["retrieve", "generate"], "edges": [["retrieve", "generate"]]}},
    "flow": {"flow": {"start": "answer", "states": [{"name": "answer", "action": "rag"}]}},
    "yaml": {"yaml": "agents:\n  - name: responder\n    tool: kb_search\n    runtime: rag-v1\n"},
}


def create_agent_version(
    project_id: str,
    system_prompt_artifact_id: str,
    kb_release_artifact_id: str,
    retrieval_strategy: str = "vector",
    build_paradigm: str = "code",
    extra_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    sp = _lin().get_artifact(system_prompt_artifact_id)
    kbr = _lin().get_artifact(kb_release_artifact_id)
    if sp is None or sp.type != "system_prompt":
        raise ValueError("system_prompt_artifact_id is not a system_prompt artifact")
    if kbr is None or kbr.type != "kb_release":
        raise ValueError("kb_release_artifact_id is not a kb_release artifact")
    if retrieval_strategy not in VALID_MODES:
        raise ValueError(f"unsupported retrieval_strategy '{retrieval_strategy}'")
    release_key = kbr.payload.get("release_key")

    artifact = _lin().create_artifact(
        project_id=project_id,
        type="agent_version",
        payload={
            "build_paradigm": build_paradigm,
            "runtime": "rag-v1",
            "retrieval_strategy": retrieval_strategy,
            "release_key": release_key,
            "kb_release_artifact_id": kb_release_artifact_id,
            "system_prompt_artifact_id": system_prompt_artifact_id,
            "config": {"k": 4, "model": DEFAULT_MODEL, **(extra_config or {})},
        },
        created_by="build-runtime",
        parents=[system_prompt_artifact_id, kb_release_artifact_id],
    )
    return {
        "agent_version_id": artifact.id,
        "version": artifact.version,
        "release_key": release_key,
        "build_paradigm": build_paradigm,
    }


def build_agent(
    project_id: str,
    paradigm: str,
    system_prompt_artifact_id: str,
    kb_release_artifact_id: str,
    retrieval_strategy: str = "vector",
) -> dict[str, Any]:
    """Build an agent_version via a chosen paradigm. Generative synthesizes its
    config from the spec (via the router) and is flagged unvalidated until eval."""
    if paradigm == "generative":
        sp = _lin().get_artifact(system_prompt_artifact_id)
        system_prompt = (sp.payload.get("text") if sp else "") or ""
        with httpx.Client(timeout=60.0) as client:
            g = client.post(
                f"{ROUTER_URL}/v1/route",
                json={"prompt_key": "agent.generate_config", "vars": {"system_prompt": system_prompt},
                      "project_id": project_id},
            )
            g.raise_for_status()
            text = g.json()["text"]
        import json as _json
        import re as _re
        m = _re.search(r"\{.*\}", text, _re.S)
        cfg = _json.loads(m.group(0)) if m else {}
        rs = cfg.get("retrieval_strategy", retrieval_strategy)
        if rs not in VALID_MODES:
            rs = retrieval_strategy
        extra = {"generated": cfg, "validated": False}
        return create_agent_version(project_id, system_prompt_artifact_id, kb_release_artifact_id, rs, "generative", extra)

    if paradigm not in PARADIGM_CONFIG:
        raise ValueError(f"unknown paradigm '{paradigm}'")
    return create_agent_version(
        project_id, system_prompt_artifact_id, kb_release_artifact_id,
        retrieval_strategy, paradigm, PARADIGM_CONFIG[paradigm],
    )


def chat(agent_version_id: str, question: str, k: int = 4) -> dict[str, Any]:
    av = _lin().get_artifact(agent_version_id)
    if av is None or av.type != "agent_version":
        raise ValueError("agent_version_id is not an agent_version artifact")
    project_id = av.project_id
    release_key = av.payload["release_key"]
    mode = av.payload.get("retrieval_strategy", "vector")
    sp = _lin().get_artifact(av.payload["system_prompt_artifact_id"])
    system_prompt = (sp.payload.get("text") if sp else "") or ""

    with httpx.Client(timeout=60.0) as client:
        # retrieve (mode chosen per agent_version)
        r = client.post(
            f"{GROUND_URL}/v1/retrieve",
            json={"project_id": project_id, "release_key": release_key, "query": question, "k": k, "mode": mode},
        )
        r.raise_for_status()
        chunks = r.json()["chunks"]
        context = "\n\n".join(f"[{c['item_id'][:8]}] {c['body']}" for c in chunks) or "(no context found)"

        # generate
        g = client.post(
            f"{ROUTER_URL}/v1/route",
            json={
                "prompt_key": "agent.answer",
                "vars": {"system_prompt": system_prompt, "context": context, "question": question},
                "project_id": project_id,
            },
        )
        g.raise_for_status()
        gen = g.json()

    top = chunks[0] if chunks else None
    provenance = {
        "release_key": release_key,
        "agent_version": av.version,
        "item_id": top["item_id"] if top else None,
        "revision_id": top["revision_id"] if top else None,
        "chunk_id": top["chunk_id"] if top else None,
    }
    return {
        "answer": gen["text"],
        "retrieval_mode": mode,
        "provenance": provenance,
        "citations": [
            {"item_id": c["item_id"], "chunk_id": c["chunk_id"], "score": c["score"], "heading_path": c["heading_path"]}
            for c in chunks
        ],
        "model": gen["model"],
        "cost_usd": gen["cost_usd"],
        "latency_ms": gen["latency_ms"],
    }
