#!/usr/bin/env bash
# Seed Phase-2 (Shape & plan) prompts into the model-router registry (idempotent).
set -u
ROUTER="${MODEL_ROUTER_URL:-http://localhost:8789}"

seed_prompt() {
  local key="$1" name="$2" model="$3" template="$4"
  curl -s -o /dev/null -X POST "$ROUTER/v1/prompts" -H 'Content-Type: application/json' \
    -d "{\"key\":\"$key\",\"name\":\"$name\"}"
  curl -s -o /dev/null -X POST "$ROUTER/v1/prompts/$key/versions" -H 'Content-Type: application/json' \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"version":1,"template":sys.argv[1],"default_model":sys.argv[2],"activate":True}))' "$template" "$model")"
  curl -s -o /dev/null -X POST "$ROUTER/v1/prompts/$key/activate?version=1"
  echo "  seeded $key"
}

read -r -d '' DISCOVER_TPL <<'TPL'
You are a discovery analyst. For the problem/opportunity: "{{ problem }}"

Return a single JSON object (no prose, no fences):
{"problem":"restated problem","evidence":[{"claim":"...","sources":["..."],"corroboration":2}],
 "marketNotes":"...","feasibilityScore":1-3,"uncertaintyScore":1-3,"status":"validated"}
Output only the JSON object.
TPL

read -r -d '' DEFINE_TPL <<'TPL'
You are a product definer. Given this validated opportunity JSON:
{{ opportunity }}

Return a single JSON object (no prose, no fences):
{"targetUser":"...","need":"...","capabilities":["..."],"successMetrics":["..."],
 "tovDirection":"...","feasibilityCheck":"...","compliancePrecheck":"...","status":"draft"}
Output only the JSON object.
TPL

read -r -d '' PLAN_TPL <<'TPL'
You are a delivery planner. Given the scope and ADR:
SCOPE: {{ scope }}
ADR: {{ adr }}

Return a single JSON object (no prose, no fences):
{"epics":[{"summary":"...","stories":[{"summary":"...","tasks":["..."],"points":3}]}],
 "resourcing":[{"person":"TBD","team":"...","role":"..."}]}
Output only the JSON object.
TPL

echo "── Seeding Phase-2 prompts ──"
seed_prompt "discover.opportunity" "Discover opportunity" "claude-sonnet-4-6" "$DISCOVER_TPL"
seed_prompt "define.proposition" "Define proposition" "claude-sonnet-4-6" "$DEFINE_TPL"
seed_prompt "plan.plan" "Plan" "claude-sonnet-4-6" "$PLAN_TPL"
echo "done."
