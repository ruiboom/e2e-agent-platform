#!/usr/bin/env bash
# Prove milestone M6 (deploy breadth): one agent_version to >=2 targets +
# >=3 channels with runtime guardrails active and provenance on every answer.
set -u
bash "$(dirname "$0")/seed-phase1.sh" >/dev/null 2>&1 && echo "prompts seeded"
uv run python "$(dirname "$0")/verify_m6.py"
