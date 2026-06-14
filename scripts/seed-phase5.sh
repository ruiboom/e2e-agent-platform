#!/usr/bin/env bash
# Seed Phase-5 (test-set generation) prompt (idempotent).
set -u
ROUTER="${MODEL_ROUTER_URL:-http://localhost:8789}"

read -r -d '' SUITE_TPL <<'TPL'
You are a test designer for a conversational agent with this system prompt:
{{ system_prompt }}

Produce a multi-persona test suite as a single JSON object (no prose, no fences):
{"personas":[{"name":"...","style":"..."}],
 "tags":["topic","behavior","scope_boundary","out_of_scope"],
 "cases":[{"utterance":"...","expected":"...","tags":["..."],"persona":"...","difficulty":"easy|medium|hard"}]}
Use exactly 2 personas and 4 cases (2 per persona). Output only the JSON object.
TPL

curl -s -o /dev/null -X POST "$ROUTER/v1/prompts" -H 'Content-Type: application/json' \
  -d '{"key":"test.suite","name":"Test suite"}'
curl -s -o /dev/null -X POST "$ROUTER/v1/prompts/test.suite/versions" -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,sys;print(json.dumps({"version":1,"template":sys.argv[1],"default_model":"claude-sonnet-4-6","activate":True}))' "$SUITE_TPL")"
curl -s -o /dev/null -X POST "$ROUTER/v1/prompts/test.suite/activate?version=1"
echo "  seeded test.suite"
