#!/usr/bin/env bash
# Prove milestone M7 (operate & loop): a deployed agent's real logs produce an
# auto-improvement proposal that re-enters the pipeline as a new artifact version.
set -u
bash "$(dirname "$0")/seed-phase1.sh" >/dev/null 2>&1
bash "$(dirname "$0")/seed-phase7.sh" >/dev/null 2>&1
echo "prompts seeded"
uv run python "$(dirname "$0")/verify_m7.py"
