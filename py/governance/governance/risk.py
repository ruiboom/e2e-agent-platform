"""Risk classifier — tiers an agent by the sensitivity of its purpose.

Heuristic + signal list (deterministic, offline). The production target is a
trained risk classifier (the call site `classify_risk` is the stable seam).
"""
from __future__ import annotations

_HIGH = [
    "financial advice", "investment advice", "eligibility", "creditworthiness",
    "loan", "mortgage", "pricing decision", "approve", "autonomous", "medical",
    "diagnos", "legal advice", "underwriting",
]
_LIMITED = ["overdraft", "account", "fees", "support", "complaint", "payment"]


def classify_risk(text: str) -> dict:
    t = (text or "").lower()
    high = [k for k in _HIGH if k in t]
    if high:
        return {"risk_tier": "high", "signals": high}
    limited = [k for k in _LIMITED if k in t]
    if limited:
        return {"risk_tier": "limited", "signals": limited}
    return {"risk_tier": "minimal", "signals": []}
