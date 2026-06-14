#!/usr/bin/env bash
# H2 — OPA-style policy engine + risk classifier at Gate 2.
set -u
bash "$(dirname "$0")/seed-phase1.sh" >/dev/null 2>&1
uv run python "$(dirname "$0")/verify_h_policy.py"
