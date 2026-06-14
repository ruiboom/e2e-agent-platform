#!/usr/bin/env bash
# Seed Phase-7 (operate / rewriter) prompt (idempotent).
set -u
ROUTER="${MODEL_ROUTER_URL:-http://localhost:8789}"

read -r -d '' IMPROVE_TPL <<'TPL'
You improve an AI agent's system prompt based on live traffic where it struggled.

Current system prompt:
{{ system_prompt }}

Questions the agent handled poorly (weak retrieval / off-topic):
{{ weak_examples }}

Propose an improved system prompt that better handles these cases and sets clearer
scope boundaries. Return a single JSON object (no prose, no fences):
{"system_prompt":"the improved system prompt","rationale":"one sentence on what changed"}
Output only the JSON object.
TPL

curl -s -o /dev/null -X POST "$ROUTER/v1/prompts" -H 'Content-Type: application/json' \
  -d '{"key":"operate.improve","name":"Operate improve"}'
curl -s -o /dev/null -X POST "$ROUTER/v1/prompts/operate.improve/versions" -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,sys;print(json.dumps({"version":1,"template":sys.argv[1],"default_model":"claude-sonnet-4-6","activate":True}))' "$IMPROVE_TPL")"
curl -s -o /dev/null -X POST "$ROUTER/v1/prompts/operate.improve/activate?version=1"
echo "  seeded operate.improve"
