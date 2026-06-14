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
from sqlalchemy import text

from governance import redact_pii, scan_injection
from lineage import LineageClient

from app import rag

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
    # langgraph runs a real compiled StateGraph at chat time (see langgraph_runtime).
    "langgraph": {"graph": {"engine": "langgraph", "nodes": ["retrieve", "generate"],
                            "edges": [["__start__", "retrieve"], ["retrieve", "generate"], ["generate", "__end__"]]}},
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


def chat(agent_version_id: str, question: str, k: int = 4,
         user_id: str | None = None, session_id: str | None = None) -> dict[str, Any]:
    av = _lin().get_artifact(agent_version_id)
    if av is None or av.type != "agent_version":
        raise ValueError("agent_version_id is not an agent_version artifact")
    project_id = av.project_id
    release_key = av.payload["release_key"]
    mode = av.payload.get("retrieval_strategy", "vector")
    sp = _lin().get_artifact(av.payload["system_prompt_artifact_id"])
    system_prompt = (sp.payload.get("text") if sp else "") or ""

    # Runtime guardrails (on by default). Injection -> block + escalate;
    # PII in the input -> redact before it reaches the model / logs.
    inj = scan_injection(question)
    if inj.blocked:
        return {
            "answer": "I can't help with that request. It's been flagged for review.",
            "retrieval_mode": mode,
            "guardrails": {"injection": "blocked", "escalated": True, "match": inj.findings},
            "provenance": {"release_key": release_key, "agent_version": av.version,
                           "item_id": None, "revision_id": None, "chunk_id": None},
            "citations": [], "model": None, "cost_usd": 0.0, "latency_ms": 0.0,
        }
    safe_question, pii = redact_pii(question)
    guardrails = {"injection": "pass", "pii_redactions": len(pii), "escalated": False}
    question = safe_question

    # Orchestrate retrieve -> generate. The `langgraph` paradigm runs a real
    # LangGraph StateGraph; other paradigms call the shared steps directly.
    paradigm = av.payload.get("build_paradigm", "code")
    if paradigm == "langgraph":
        from app import langgraph_runtime
        chunks, gen = langgraph_runtime.run(project_id, release_key, mode, system_prompt, question, k)
    else:
        chunks = rag.retrieve(project_id, release_key, question, k, mode)
        gen = rag.generate(project_id, system_prompt, rag.build_context(chunks), question)

    # Output-side DLP: redact any PII the model emitted before it leaves the system.
    answer, out_pii = redact_pii(gen["text"])
    guardrails["output_pii"] = len(out_pii)

    top = chunks[0] if chunks else None
    top_score = float(top["score"]) if top else 0.0
    provenance = {
        "release_key": release_key,
        "agent_version": av.version,
        "item_id": top["item_id"] if top else None,
        "revision_id": top["revision_id"] if top else None,
        "chunk_id": top["chunk_id"] if top else None,
    }

    # Live signal for the operate loop: log the turn, flag weak retrievals.
    # Threshold calibrated for the active embedder (bge relevant ~0.6-0.8); tunable.
    flagged = top_score < float(os.environ.get("CHAT_FLAG_THRESHOLD", "0.5"))
    try:
        with _lin().engine.begin() as conn:
            conn.execute(
                text("INSERT INTO chat_log (project_id, agent_version_id, question, answer, top_score, flagged, user_id, session_id) "
                     "VALUES (:p,:a,:q,:ans,:s,:f,:u,:sid)"),
                {"p": project_id, "a": agent_version_id, "q": question, "ans": answer,
                 "s": top_score, "f": flagged, "u": user_id, "sid": session_id},
            )
    except Exception:  # logging must never break a chat
        pass

    return {
        "answer": answer,
        "retrieval_mode": mode,
        "build_paradigm": paradigm,
        "guardrails": guardrails,
        "provenance": provenance,
        "citations": [
            {"item_id": c["item_id"], "chunk_id": c["chunk_id"], "score": c["score"], "heading_path": c["heading_path"]}
            for c in chunks
        ],
        "model": gen["model"],
        "cost_usd": gen["cost_usd"],
        "latency_ms": gen["latency_ms"],
    }
