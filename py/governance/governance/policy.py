"""A small, deterministic policy engine (an OPA-style deny-rules evaluator).

`opa_rules` shape stored on `policy_bundle`:

    {"deny": [
       {"id": "high-risk-voice",
        "all": [{"field": "risk_tier", "op": "eq", "value": "high"},
                {"field": "channels",  "op": "contains", "value": "voice"}],
        "reason": "high-risk agents may not use the voice channel without handoff"}
    ]}

A rule denies when ALL of its conditions hold. A single-condition rule may use the
flat `{field, op, value}` form instead of `all`. Operators: eq, ne, lt, gt, in,
contains, not_contains. This is intentionally a thin engine you can later swap for
real OPA/Rego — the call sites (`evaluate`) stay the same.
"""
from __future__ import annotations

from typing import Any


def _cond(c: dict[str, Any], ctx: dict[str, Any]) -> bool:
    val = ctx.get(c["field"])
    op, target = c["op"], c.get("value")
    try:
        if op == "eq":
            return val == target
        if op == "ne":
            return val != target
        if op == "lt":
            return val is not None and val < target
        if op == "gt":
            return val is not None and val > target
        if op == "in":
            return val in (target or [])
        if op == "contains":
            return target in (val or [])
        if op == "not_contains":
            return target not in (val or [])
    except TypeError:
        return False
    return False


def _matches(rule: dict[str, Any], ctx: dict[str, Any]) -> bool:
    conds = rule.get("all") or [rule]
    return all(_cond(c, ctx) for c in conds)


def evaluate(rules: dict[str, Any] | None, context: dict[str, Any]) -> dict[str, Any]:
    """Return {allow, violations:[{id, reason}]} for the given context."""
    violations = [
        {"id": r.get("id", "?"), "reason": r.get("reason", "denied by policy")}
        for r in (rules or {}).get("deny", [])
        if _matches(r, context)
    ]
    return {"allow": not violations, "violations": violations}
