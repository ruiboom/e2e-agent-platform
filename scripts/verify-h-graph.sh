#!/usr/bin/env bash
# H7 — Neo4j graph store + graph-enricher. Requires the neo4j container + ground + router.
set -u
bash "$(dirname "$0")/seed-h-graph.sh" >/dev/null 2>&1
uv run python "$(dirname "$0")/verify_h_graph.py"
