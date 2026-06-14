#!/usr/bin/env bash
# Seed the graph-enricher prompt (H7), idempotent.
set -u
ROUTER="${MODEL_ROUTER_URL:-http://localhost:8789}"

read -r -d '' ENRICH_TPL <<'TPL'
You extract a small knowledge graph from a passage. For the text:
{{ text }}

Return a single JSON object (no prose, no fences):
{"entities":["short lowercase term", "..."],
 "relationships":[{"source":"term a","target":"term b","type":"short relation"}]}
Use 3-8 salient, lowercase entity names (concepts, products, terms). Output only the JSON.
TPL

curl -s -o /dev/null -X POST "$ROUTER/v1/prompts" -H 'Content-Type: application/json' \
  -d '{"key":"graph.enrich","name":"Graph enricher"}'
curl -s -o /dev/null -X POST "$ROUTER/v1/prompts/graph.enrich/versions" -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,sys;print(json.dumps({"version":1,"template":sys.argv[1],"default_model":"claude-haiku-4-5","activate":True}))' "$ENRICH_TPL")"
curl -s -o /dev/null -X POST "$ROUTER/v1/prompts/graph.enrich/activate?version=1"
echo "  seeded graph.enrich"
