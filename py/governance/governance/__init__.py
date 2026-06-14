"""Governance scanners.

PII detection (H4): a checksum-validated regex baseline (always available) PLUS a
Presidio analyzer when installed (`presidio-analyzer` + a spaCy model). Presidio
adds NER entities (PERSON, LOCATION, …) and confidence scores; the regex layer
adds card-Luhn and IBAN-mod97 validation to cut false positives. Used on ingest,
on the user's input, and on the agent's output.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ScanResult:
    scanner: str
    findings: list[dict] = field(default_factory=list)
    blocked: bool = False


# ── regex layer (validated) ───────────────────────────────────────────────
_EMAIL = re.compile(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", re.I)
_UK_PHONE = re.compile(r"\b(?:0\d{4}|\+44\s?\d{4})\s?\d{6}\b")
_SORT_CODE = re.compile(r"\b\d{2}-\d{2}-\d{2}\b")
_UK_NI = re.compile(r"\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b")
_IPV4 = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
_CARD = re.compile(r"\b(?:\d[ -]?){13,19}\b")
_IBAN = re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b")


def _luhn_ok(digits: str) -> bool:
    s, alt = 0, False
    for ch in reversed(digits):
        d = ord(ch) - 48
        if alt:
            d *= 2
            if d > 9:
                d -= 9
        s += d
        alt = not alt
    return s % 10 == 0 and len(digits) >= 13


def _iban_ok(iban: str) -> bool:
    s = iban[4:] + iban[:4]
    n = "".join(str(ord(c) - 55) if c.isalpha() else c for c in s)
    try:
        return int(n) % 97 == 1
    except ValueError:
        return False


def _regex_findings(text: str) -> list[dict]:
    t = text or ""
    out: list[dict] = []
    for kind, pat in (("email", _EMAIL), ("uk_phone", _UK_PHONE), ("sort_code", _SORT_CODE),
                      ("uk_ni", _UK_NI), ("ip", _IPV4)):
        out += [{"type": kind, "span": [m.start(), m.end()], "source": "regex"} for m in pat.finditer(t)]
    for m in _CARD.finditer(t):                       # validated: Luhn
        if _luhn_ok(re.sub(r"\D", "", m.group(0))):
            out.append({"type": "card", "span": [m.start(), m.end()], "source": "regex+luhn"})
    for m in _IBAN.finditer(t):                       # validated: mod-97
        if _iban_ok(m.group(0)):
            out.append({"type": "iban", "span": [m.start(), m.end()], "source": "regex+mod97"})
    return out


# ── Presidio layer (when installed) ───────────────────────────────────────
_UNSET: Any = object()
_PRESIDIO: Any = _UNSET


def _presidio():
    global _PRESIDIO
    if _PRESIDIO is _UNSET:
        try:
            from presidio_analyzer import AnalyzerEngine
            from presidio_analyzer.nlp_engine import NlpEngineProvider
            provider = NlpEngineProvider(nlp_configuration={
                "nlp_engine_name": "spacy",
                "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
            })
            _PRESIDIO = AnalyzerEngine(nlp_engine=provider.create_engine())
        except Exception:
            _PRESIDIO = None
    return _PRESIDIO


def pii_engine() -> str:
    return "presidio+regex" if _presidio() is not None else "regex"


def _presidio_findings(text: str, threshold: float = 0.5) -> list[dict]:
    eng = _presidio()
    if eng is None or not text:
        return []
    try:
        results = eng.analyze(text=text, language="en")
    except Exception:
        return []
    return [
        {"type": r.entity_type.lower(), "span": [r.start, r.end], "score": round(r.score, 2), "source": "presidio"}
        for r in results if r.score >= threshold
    ]


def scan_pii(text: str) -> ScanResult:
    findings = _regex_findings(text) + _presidio_findings(text)
    return ScanResult(scanner=pii_engine(), findings=findings)


def redact_pii(text: str) -> tuple[str, list[dict]]:
    """Replace each PII span with [TYPE]; returns (redacted, findings)."""
    findings = scan_pii(text).findings
    out = text or ""
    for f in sorted(findings, key=lambda x: x["span"][0], reverse=True):
        a, b = f["span"]
        out = out[:a] + f"[{f['type'].upper()}]" + out[b:]
    return out, findings


# ── injection + classification ────────────────────────────────────────────
_INJECTION_RE = re.compile("|".join([
    r"ignore (all |the |your )?(previous|prior|above) (instructions|prompts?)",
    r"disregard (the |your )?(system|previous) (prompt|instructions)",
    r"reveal (your |the )?(system prompt|instructions|secrets?)",
    r"you are now", r"pretend (you are|to be)", r"developer mode",
]), re.I)


def scan_injection(text: str) -> ScanResult:
    m = _INJECTION_RE.search(text or "")
    findings = [{"type": "prompt_injection", "match": m.group(0)}] if m else []
    return ScanResult(scanner="injection", findings=findings, blocked=bool(findings))


def classify(text: str) -> ScanResult:  # noqa: ARG001
    return ScanResult(scanner="classification")


from governance.policy import evaluate as evaluate_policy  # noqa: E402
from governance.risk import classify_risk  # noqa: E402

__all__ = [
    "ScanResult", "scan_pii", "scan_injection", "classify", "redact_pii",
    "pii_engine", "evaluate_policy", "classify_risk",
]
