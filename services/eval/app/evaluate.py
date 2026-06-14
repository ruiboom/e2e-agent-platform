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
from sqlalchemy import text

from governance import classify_risk, evaluate_policy
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


# ── Phase 5: multi-persona suite + Gate 2 ─────────────────────────────────
def generate_testsuite(agent_version_id: str) -> dict[str, Any]:
    av = _lin().get_artifact(agent_version_id)
    if av is None or av.type != "agent_version":
        raise ValueError("agent_version_id is not an agent_version artifact")
    sp = _lin().get_artifact(av.payload["system_prompt_artifact_id"])
    system_prompt = (sp.payload.get("text") if sp else "") or ""
    with httpx.Client(timeout=90.0) as c:
        r = c.post(f"{ROUTER_URL}/v1/route",
                   json={"prompt_key": "test.suite", "vars": {"system_prompt": system_prompt}, "project_id": av.project_id})
        r.raise_for_status()
        m = re.search(r"\{.*\}", r.json()["text"], re.S)
    suite = json.loads(m.group(0)) if m else {"personas": [], "cases": []}
    art = _lin().create_artifact(project_id=av.project_id, type="test_suite", payload=suite,
                                 created_by="eval", parents=[agent_version_id])
    return {"test_suite_id": art.id, "personas": len(suite.get("personas", [])), "cases": len(suite.get("cases", []))}


def run_suite(agent_version_id: str, test_suite_id: str) -> dict[str, Any]:
    av = _lin().get_artifact(agent_version_id)
    suite = _lin().get_artifact(test_suite_id)
    if av is None or suite is None:
        raise ValueError("agent_version or test_suite not found")
    cases = suite.payload.get("cases", [])
    per_case: list[dict[str, Any]] = []
    per_persona: dict[str, list[float]] = {}
    total_cost = total_lat = 0.0
    with httpx.Client(timeout=120.0) as client:
        for case in cases:
            q = case.get("utterance", "")
            persona = case.get("persona", "default")
            expected = case.get("expected", "")
            chat = client.post(f"{RUNTIME_URL}/v1/chat", json={"agent_version_id": agent_version_id, "question": q}).json()
            total_cost += float(chat.get("cost_usd") or 0.0)
            total_lat += float(chat.get("latency_ms") or 0.0)
            judged = client.post(f"{ROUTER_URL}/v1/route", json={"prompt_key": "eval.judge",
                     "vars": {"question": q, "context": expected or "(no reference)", "answer": chat.get("answer", "")},
                     "project_id": av.project_id}).json()
            total_cost += float(judged.get("cost_usd") or 0.0)
            v = _parse_judge(judged["text"])
            per_case.append({"persona": persona, "question": q, "score": v["score"], "class": v["class"]})
            per_persona.setdefault(persona, []).append(v["score"])
    n = max(len(per_case), 1)
    quality = sum(c["score"] for c in per_case) / n
    metrics = {"quality": round(quality, 3), "latency_ms": round(total_lat / n, 1), "cost_usd": round(total_cost, 6)}
    persona_roll = {p: round(sum(s) / len(s), 3) for p, s in per_persona.items()}
    art = _lin().create_artifact(project_id=av.project_id, type="eval_run",
        payload={"source": "synthetic", "metrics": metrics, "perCase": per_case, "perPersona": persona_roll,
                 "gateResult": "pass" if quality >= QUALITY_GATE else "fail"},
        created_by="eval", parents=[agent_version_id, test_suite_id])
    return {"eval_run_id": art.id, "metrics": metrics, "perPersona": persona_roll,
            "gateResult": "pass" if quality >= QUALITY_GATE else "fail"}


def get_policy(project_id: str) -> dict[str, Any]:
    with _lin().engine.connect() as conn:
        row = conn.execute(
            text("SELECT pre_deploy_gates, opa_rules FROM policy_bundle WHERE project_id=:p ORDER BY id LIMIT 1"),
            {"p": project_id}).first()
    return {
        "pre_deploy_gates": (row.pre_deploy_gates if row else {}),
        "opa_rules": (row.opa_rules if row else {}),
    }


def set_policy(project_id: str, gates: dict[str, Any], opa_rules: dict[str, Any] | None = None) -> dict[str, Any]:
    with _lin().engine.begin() as conn:
        row = conn.execute(text("SELECT id FROM policy_bundle WHERE project_id=:p LIMIT 1"), {"p": project_id}).first()
        if row:
            conn.execute(text("UPDATE policy_bundle SET pre_deploy_gates=CAST(:g AS jsonb) WHERE id=:id"),
                         {"g": json.dumps(gates), "id": row.id})
            if opa_rules is not None:
                conn.execute(text("UPDATE policy_bundle SET opa_rules=CAST(:o AS jsonb) WHERE id=:id"),
                             {"o": json.dumps(opa_rules), "id": row.id})
        else:
            conn.execute(
                text("INSERT INTO policy_bundle (project_id, pre_deploy_gates, opa_rules) "
                     "VALUES (:p, CAST(:g AS jsonb), CAST(:o AS jsonb))"),
                {"p": project_id, "g": json.dumps(gates), "o": json.dumps(opa_rules or {})})
    return {"project_id": project_id, "pre_deploy_gates": gates, "opa_rules": opa_rules}


def _scope_topic(project_id: str) -> str:
    with _lin().engine.connect() as conn:
        r = conn.execute(
            text("SELECT payload->>'topic' FROM artifact WHERE project_id=:p AND type='scope' "
                 "ORDER BY version DESC LIMIT 1"), {"p": project_id}).scalar()
    return r or ""


def gate2(project_id: str, agent_version_id: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    with _lin().engine.connect() as conn:
        ev = conn.execute(text(
            "SELECT a.payload FROM artifact a JOIN artifact_parent ap ON ap.child_id=a.id "
            "WHERE a.type='eval_run' AND ap.parent_id=:av ORDER BY a.version DESC LIMIT 1"),
            {"av": agent_version_id}).first()
    if not ev:
        return {"pass": False, "reasons": ["no eval_run for this agent_version"]}
    metrics = ev.payload["metrics"]
    policy = get_policy(project_id)
    gates = policy["pre_deploy_gates"] or {"quality": QUALITY_GATE}

    # Classify risk from the agent's purpose (scope topic + system prompt).
    av = _lin().get_artifact(agent_version_id)
    sp = _lin().get_artifact(av.payload["system_prompt_artifact_id"]) if av else None
    sp_text = (sp.payload.get("text") if sp else "") or ""
    risk = classify_risk(f"{_scope_topic(project_id)} {sp_text}")
    ctx = {**(context or {}), "risk_tier": risk["risk_tier"], **metrics}

    reasons: list[str] = []
    if "quality" in gates and metrics["quality"] < gates["quality"]:
        reasons.append(f"quality {metrics['quality']} < {gates['quality']}")
    if "latency_ms" in gates and metrics["latency_ms"] > gates["latency_ms"]:
        reasons.append(f"latency {metrics['latency_ms']} > {gates['latency_ms']}")
    if "cost_usd" in gates and metrics["cost_usd"] > gates["cost_usd"]:
        reasons.append(f"cost {metrics['cost_usd']} > {gates['cost_usd']}")
    pol = evaluate_policy(policy["opa_rules"], ctx)
    for v in pol["violations"]:
        reasons.append(f"policy[{v['id']}]: {v['reason']}")

    passed = not reasons
    gate_id = None
    if passed:
        art = _lin().create_artifact(project_id=project_id, type="gate2",
            payload={"decision": "pass", "metrics": metrics, "gates": gates,
                     "risk_tier": risk["risk_tier"], "context": ctx},
            created_by="gate", parents=[agent_version_id])
        gate_id = art.id
    return {"pass": passed, "reasons": reasons, "metrics": metrics, "gates": gates,
            "risk_tier": risk["risk_tier"], "risk_signals": risk["signals"], "gate2_id": gate_id}
