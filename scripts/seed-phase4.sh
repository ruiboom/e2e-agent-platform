#!/usr/bin/env bash
# Seed Phase-4 (generative builder) prompt (idempotent).
set -u
ROUTER="${MODEL_ROUTER_URL:-http://localhost:8789}"

read -r -d '' GEN_TPL <<'TPL'
You configure a retrieval-augmented agent. Given this system prompt:
{{ system_prompt }}

Return a single JSON object (no prose, no fences):
{"retrieval_strategy":"vector|lexical|hybrid|graph|graph_hybrid","k":4,"style":"short description of answer style"}
Output only the JSON object.
TPL

curl -s -o /dev/null -X POST "$ROUTER/v1/prompts" -H 'Content-Type: application/json' \
  -d '{"key":"agent.generate_config","name":"Generative agent config"}'
curl -s -o /dev/null -X POST "$ROUTER/v1/prompts/agent.generate_config/versions" -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,sys;print(json.dumps({"version":1,"template":sys.argv[1],"default_model":"claude-sonnet-4-6","activate":True}))' "$GEN_TPL")"
curl -s -o /dev/null -X POST "$ROUTER/v1/prompts/agent.generate_config/activate?version=1"
echo "  seeded agent.generate_config"
