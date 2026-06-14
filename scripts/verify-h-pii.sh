#!/usr/bin/env bash
# H4 — validated PII detection (Presidio + checksum regex) + I/O redaction.
set -u
bash "$(dirname "$0")/seed-phase1.sh" >/dev/null 2>&1
uv run python "$(dirname "$0")/verify_h_pii.py"
