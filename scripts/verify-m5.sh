#!/usr/bin/env bash
# Prove milestone M5 (prove depth): multi-persona suite -> quality/latency/cost
# eval -> Gate 2 blocks a failing agent and passes a good one (deploy gated).
set -u
bash "$(dirname "$0")/seed-phase1.sh" >/dev/null 2>&1
bash "$(dirname "$0")/seed-phase5.sh" >/dev/null 2>&1
echo "prompts seeded"
uv run python "$(dirname "$0")/verify_m5.py"
