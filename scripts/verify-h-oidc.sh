#!/usr/bin/env bash
# H6 — real OIDC auth (local test issuer must be running: node scripts/oidc-test-issuer.mjs).
set -u
uv run python "$(dirname "$0")/verify_h_oidc.py"
