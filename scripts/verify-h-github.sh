#!/usr/bin/env bash
# H9 — GitHub connector (needs network for the GitHub API).
set -u
uv run python "$(dirname "$0")/verify_h_github.py"
