"""Governance scanners.

Phase 6 ships real (if lightweight) PII + prompt-injection scanners used as
runtime guardrails. Production-grade depth (Presidio, a trained risk classifier,
OPA policy) is the deferred upgrade; the interface here is stable.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class ScanResult:
    scanner: str
    findings: list[dict] = field(default_factory=list)
    blocked: bool = False


_PII_PATTERNS = {
    "email": re.compile(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", re.I),
    "card": re.compile(r"\b(?:\d[ -]?){13,16}\b"),
    "uk_phone": re.compile(r"\b(?:0\d{4}|\+44\s?\d{4})\s?\d{6}\b"),
    "sort_code": re.compile(r"\b\d{2}-\d{2}-\d{2}\b"),
}

_INJECTION_PATTERNS = [
    r"ignore (all |the |your )?(previous|prior|above) (instructions|prompts?)",
    r"disregard (the |your )?(system|previous) (prompt|instructions)",
    r"reveal (your |the )?(system prompt|instructions|secrets?)",
    r"you are now",
    r"pretend (you are|to be)",
    r"developer mode",
]
_INJECTION_RE = re.compile("|".join(_INJECTION_PATTERNS), re.I)


def scan_pii(text: str) -> ScanResult:
    findings = []
    for kind, pat in _PII_PATTERNS.items():
        for m in pat.finditer(text or ""):
            findings.append({"type": kind, "span": [m.start(), m.end()]})
    return ScanResult(scanner="pii", findings=findings)


def scan_injection(text: str) -> ScanResult:
    m = _INJECTION_RE.search(text or "")
    findings = [{"type": "prompt_injection", "match": m.group(0)}] if m else []
    return ScanResult(scanner="injection", findings=findings, blocked=bool(findings))


def classify(text: str) -> ScanResult:  # noqa: ARG001
    """STUB: risk/classification guard. Deferred (real classifier later)."""
    return ScanResult(scanner="classification")


def redact_pii(text: str) -> tuple[str, list[dict]]:
    """Return (redacted_text, findings)."""
    findings = scan_pii(text).findings
    out = text or ""
    for kind, pat in _PII_PATTERNS.items():
        out = pat.sub(f"[{kind.upper()}]", out)
    return out, findings


from governance.policy import evaluate as evaluate_policy  # noqa: E402
from governance.risk import classify_risk  # noqa: E402

__all__ = [
    "ScanResult", "scan_pii", "scan_injection", "classify", "redact_pii",
    "evaluate_policy", "classify_risk",
]
