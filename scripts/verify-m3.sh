#!/usr/bin/env bash
# Prove milestone M3 (Ground depth): governed ingest (web/docs/RSS, four-eyes),
# all six retrieval modes, and an agent that consumes a release with hybrid RAG.
set -u
bash "$(dirname "$0")/seed-phase1.sh" >/dev/null 2>&1 && echo "prompts seeded"
uv run python "$(dirname "$0")/verify_m3.py"
