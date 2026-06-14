#!/usr/bin/env bash
# H8 — real LangGraph runtime for the langgraph paradigm.
set -u
bash "$(dirname "$0")/seed-phase1.sh" >/dev/null 2>&1
uv run python "$(dirname "$0")/verify_h_langgraph.py"
