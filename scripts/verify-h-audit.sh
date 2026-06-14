#!/usr/bin/env bash
# H1 — tamper-evident audit (hash-chained, WORM). Requires services + console up.
set -u
uv run python "$(dirname "$0")/verify_h_audit.py"
