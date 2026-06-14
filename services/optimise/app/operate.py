"""Operate loop: detect -> diagnose -> prescribe over live chat logs.

Reads a deployed agent's real logs, diagnoses weak interactions (low retrieval
score / flagged), and prescribes an improved system_prompt — emitted as a NEW
system_prompt artifact version that re-enters the pipeline (closing the loop).
The rewriter-admin auto-promote loop and intent-optimiser clustering are the
deferred production depth; this is the minimal closed loop.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx
from sqlalchemy import text

from lineage import LineageClient

ROUTER_URL = os.environ.get("MODEL_ROUTER_URL", "http://localhost:8789").rstrip("/")
_lineage: LineageClient | None = None


def _lin() -> LineageClient:
    global _lineage
    if _lineage is None:
        _lineage = LineageClient.from_database_url()
    return _lineage


def operate(agent_version_id: str) -> dict[str, Any]:
    av = _lin().get_artifact(agent_version_id)
    if av is None or av.type != "agent_version":
        raise ValueError("agent_version_id is not an agent_version artifact")
    project_id = av.project_id
    sp_id = av.payload["system_prompt_artifact_id"]
    sp = _lin().get_artifact(sp_id)
    system_prompt = (sp.payload.get("text") if sp else "") or ""

    # detect: pull the agent's recent logs (worst first)
    with _lin().engine.connect() as conn:
        rows = conn.execute(
            text("SELECT question, top_score, flagged FROM chat_log "
                 "WHERE agent_version_id=:a ORDER BY top_score ASC NULLS FIRST LIMIT 20"),
            {"a": agent_version_id},
        ).all()
    total = len(rows)
    weak = [r for r in rows if r.flagged or (r.top_score is not None and r.top_score < 0.4)]
    diagnosis = {"total_logs": total, "weak": len(weak), "weak_questions": [r.question for r in weak[:5]]}
    if total == 0:
        return {"status": "no_logs", "diagnosis": diagnosis}

    # prescribe: rewriter proposes an improved system prompt
    examples = "\n".join(f"- {r.question}" for r in (weak or list(rows))[:5])
    with httpx.Client(timeout=90.0) as c:
        r = c.post(f"{ROUTER_URL}/v1/route", json={
            "prompt_key": "operate.improve",
            "vars": {"system_prompt": system_prompt, "weak_examples": examples},
            "project_id": project_id})
        r.raise_for_status()
        m = re.search(r"\{.*\}", r.json()["text"], re.S)
    parsed = json.loads(m.group(0)) if m else {"system_prompt": system_prompt, "rationale": "no change"}
    improved = parsed.get("system_prompt", system_prompt)
    rationale = parsed.get("rationale", "")

    # close the loop: a new system_prompt version re-enters Specify/Build
    art = _lin().create_artifact(
        project_id=project_id, type="system_prompt",
        payload={"text": improved, "improved_from": sp_id, "rationale": rationale, "source": "operate"},
        created_by="optimise", parents=[sp_id],
    )
    return {
        "status": "proposed",
        "diagnosis": diagnosis,
        "new_system_prompt_id": art.id,
        "new_version": art.version,
        "rationale": rationale,
    }
