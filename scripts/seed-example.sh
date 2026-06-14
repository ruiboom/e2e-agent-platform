#!/usr/bin/env bash
# Seed the single explorable example project (run after reset-data.sh).
set -u
for s in 1 2 4 5 7; do bash "$(dirname "$0")/seed-phase$s.sh" >/dev/null 2>&1; done
bash "$(dirname "$0")/seed-h-graph.sh" >/dev/null 2>&1
uv run python "$(dirname "$0")/seed_example.py"
