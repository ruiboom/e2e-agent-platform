#!/usr/bin/env bash
# Prove milestone M8 (Academy enablement): per-stage contextual help that reads
# live from the platform, and a completable role path.
set -u
uv run python "$(dirname "$0")/verify_m8.py"
