#!/usr/bin/env bash
# Seed the Phase-1 prompts into the model-router registry (idempotent).
set -u
ROUTER="${MODEL_ROUTER_URL:-http://localhost:8789}"

seed_prompt() {
  local key="$1" name="$2" model="$3" template="$4"
  curl -s -o /dev/null -X POST "$ROUTER/v1/prompts" \
    -H 'Content-Type: application/json' -d "{\"key\":\"$key\",\"name\":\"$name\"}"
  curl -s -o /dev/null -X POST "$ROUTER/v1/prompts/$key/versions" \
    -H 'Content-Type: application/json' \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"version":1,"template":sys.argv[1],"default_model":sys.argv[2],"activate":True}))' "$template" "$model")"
  curl -s -o /dev/null -X POST "$ROUTER/v1/prompts/$key/activate?version=1"
  echo "  seeded $key"
}

read -r -d '' SPECIFY_TPL <<'TPL'
You are a product spec assistant. For the topic: "{{ topic }}"

Return a single JSON object (no prose, no markdown fences) with exactly these keys:
- "scope": {"outline": [ {"title": "Section title", "children": ["point", "point"]} ]}  (3-6 sections)
- "system_prompt": "a concise, production-ready system prompt (3-6 sentences) for an AI agent serving this topic"
- "kb_outline": {"topics": ["topic 1", "topic 2"]}  (4-8 knowledge-base topics needed to ground the agent)

Output only the JSON object.
TPL

read -r -d '' ANSWER_TPL <<'TPL'
You are a grounded assistant. Answer the user's question using ONLY the provided context. If the context is insufficient, say so. Be concise.

System guidance:
{{ system_prompt }}

Context:
{{ context }}

Question: {{ question }}
TPL

read -r -d '' JUDGE_TPL <<'TPL'
You are an evaluation judge. Given a question, the agent's answer and the source context, rate the answer's quality from 0.0 to 1.0 considering faithfulness to context and helpfulness.

Return a single JSON object: {"score": 0.0-1.0, "class": "good|neutral|poor", "commentary": "one sentence"}

Question: {{ question }}
Context: {{ context }}
Answer: {{ answer }}

Output only the JSON object.
TPL

echo "── Seeding Phase-1 prompts ──"
seed_prompt "specify.spec" "Specify spec" "claude-sonnet-4-6" "$SPECIFY_TPL"
seed_prompt "agent.answer" "Grounded answer" "claude-haiku-4-5" "$ANSWER_TPL"
seed_prompt "eval.judge" "Eval judge" "claude-sonnet-4-6" "$JUDGE_TPL"
echo "done."
