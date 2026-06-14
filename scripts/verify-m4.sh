#!/usr/bin/env bash
# Prove milestone M4 (build breadth): build the same spec via canvas / flow /
# yaml / generative — each a valid agent_version that chats + passes eval.
set -u
bash "$(dirname "$0")/seed-phase1.sh" >/dev/null 2>&1
bash "$(dirname "$0")/seed-phase4.sh" >/dev/null 2>&1
echo "prompts seeded"
uv run python "$(dirname "$0")/verify_m4.py"
