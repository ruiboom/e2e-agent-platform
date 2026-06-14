"""Minimal evaluation: chat each question, judge it, aggregate, emit eval_run.

Quality = mean judge score; latency = mean; cost = sum (chat + judge, both routed
through the model-router so they also land in cost-tracker). Emits an eval_run
lineage artifact (child of the agent_version). Gate 2 (full thresholds) is Phase 5.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

from lineage import LineageClient

GROUND_URL = os.environ.get("GROUND_URL", "http://localhost:8790").rstrip("/")
ROUTER_URL = os.environ.get("MODEL_ROUTER_URL", "http://localhost:8789").rstrip("/")
RUNTIME_URL = os.environ.get("BUILD_RUNTIME_URL", "http://localhost:8791").rstrip("/")
QUALITY_GATE = float(os.environ.get("EVAL_QUALITY_GATE", "0.6"))

_lineage: LineageClient | None = None


def _lin() -> LineageClient:
    global _lineage
    if _lineage is None:
        _lineage = LineageClient.from_database_url()
    return _lineage


def _parse_judge(text: str) -> dict[str, Any]:
    s = text.strip()
    m = re.search(r"\{.*\}", s, re.S)
    if m:
        s = m.group(0)
    try:
        obj = json.loads(s)
    except Exception:
        return {"score": 0.0, "class": "poor", "commentary": "unparseable judge output"}
    return {
        "score": float(obj.get("score", 0.0)),
        "class": obj.get("class", "neutral"),
        "commentary": obj.get("commentary", ""),
    }


def run_eval(agent_version_id: str, questions: list[str]) -> dict[str, Any]:
    av = _lin().get_artifact(agent_version_id)
    if av is None or av.type != "agent_version":
        raise ValueError("agent_version_id is not an agent_version artifact")
    project_id = av.project_id
    release_key = av.payload["release_key"]

    per_case: list[dict[str, Any]] = []
    total_cost = 0.0
    total_latency = 0.0

    with httpx.Client(timeout=90.0) as client:
        for q in questions:
            ctx = client.post(
                f"{GROUND_URL}/v1/retrieve",
                json={"project_id": project_id, "release_key": release_key, "query": q, "k": 4},
            ).json()["chunks"]
            context = "\n\n".join(c["body"] for c in ctx) or "(no context)"

            chat = client.post(
                f"{RUNTIME_URL}/v1/chat", json={"agent_version_id": agent_version_id, "question": q}
            ).json()
            answer = chat["answer"]
            total_cost += float(chat.get("cost_usd") or 0.0)
            total_latency += float(chat.get("latency_ms") or 0.0)

            judged = client.post(
                f"{ROUTER_URL}/v1/route",
                json={
                    "prompt_key": "eval.judge",
                    "vars": {"question": q, "context": context, "answer": answer},
                    "project_id": project_id,
                },
            ).json()
            total_cost += float(judged.get("cost_usd") or 0.0)
            verdict = _parse_judge(judged["text"])
            per_case.append(
                {"question": q, "score": verdict["score"], "class": verdict["class"], "commentary": verdict["commentary"]}
            )

    n = max(len(per_case), 1)
    quality = sum(c["score"] for c in per_case) / n
    metrics = {
        "quality": round(quality, 3),
        "latency_ms": round(total_latency / n, 1),
        "cost_usd": round(total_cost, 6),
    }
    gate_result = "pass" if quality >= QUALITY_GATE else "fail"

    artifact = _lin().create_artifact(
        project_id=project_id,
        type="eval_run",
        payload={
            "source": "synthetic",
            "metrics": metrics,
            "perCase": per_case,
            "gateResult": gate_result,
            "quality_gate": QUALITY_GATE,
        },
        created_by="eval",
        parents=[agent_version_id],
    )
    return {"eval_run_id": artifact.id, "metrics": metrics, "gateResult": gate_result, "perCase": per_case}
