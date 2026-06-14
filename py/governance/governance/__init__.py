"""Governance scanners — STUBBED interfaces in Phase 0.

Real scanners (Presidio PII, prompt-injection heuristics, classification guard)
are lifted from KMS + customer-facing in Phase 3/6. Phase 0 only fixes the
interface so callers can depend on a stable seam.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ScanResult:
    """Outcome of a single scanner pass over a piece of content."""

    scanner: str
    findings: list[dict] = field(default_factory=list)
    blocked: bool = False


def scan_pii(text: str) -> ScanResult:  # noqa: ARG001
    """STUB: detect personally-identifiable information. Returns no findings."""
    return ScanResult(scanner="pii")


def scan_injection(text: str) -> ScanResult:  # noqa: ARG001
    """STUB: detect prompt-injection. Returns no findings."""
    return ScanResult(scanner="injection")


def classify(text: str) -> ScanResult:  # noqa: ARG001
    """STUB: classification guard. Returns no findings."""
    return ScanResult(scanner="classification")


__all__ = ["ScanResult", "scan_pii", "scan_injection", "classify"]
