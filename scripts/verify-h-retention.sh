#!/usr/bin/env bash
# H3 — retention purge + DSAR (export/erase), audited.
set -u
bash "$(dirname "$0")/seed-phase1.sh" >/dev/null 2>&1
uv run python "$(dirname "$0")/verify_h_retention.py"
