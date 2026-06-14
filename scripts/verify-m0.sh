#!/usr/bin/env bash
# Prove milestone M0 end-to-end:
#   1. create a project -> it persists in Postgres
#   2. the model router answers a "hello" call
#   3. cost + latency show in the dashboard
#   4. RBAC blocks an unauthorised role
#
# Prereqs (see README boot sequence):
#   make infra-up   (Postgres + cost-tracker + feedback-tracker)
#   make migrate
#   make router     (model-router on :8789, with ANTHROPIC_API_KEY in .env)
#   make dev        (console on :3000)
set -u

CONSOLE="${CONSOLE_URL:-http://localhost:3000}"
COST="${COST_TRACKER_URL:-http://localhost:8787}"
ROUTER="${MODEL_ROUTER_URL:-http://localhost:8789}"
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5433/agent_platform}"

TS="$(date +%s)"
SLUG="m0-demo-${TS}"
JAR_DIR="$(mktemp -d)"
ALICE="${JAR_DIR}/alice.jar"
BOB="${JAR_DIR}/bob.jar"
PASS=0
FAIL=0

ok()   { echo "  ✓ $1"; PASS=$((PASS + 1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }
jget() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

echo "── Seed: hello.greeting prompt (idempotent) ──"
curl -s -o /dev/null -X POST "$ROUTER/v1/prompts" \
  -H 'Content-Type: application/json' -d '{"key":"hello.greeting","name":"Hello"}'
curl -s -o /dev/null -X POST "$ROUTER/v1/prompts/hello.greeting/versions" \
  -H 'Content-Type: application/json' \
  -d '{"version":1,"template":"Say a one-line friendly hello.","default_model":"claude-haiku-4-5","activate":true}'
curl -s -o /dev/null -X POST "$ROUTER/v1/prompts/hello.greeting/activate?version=1"
echo "  seeded."

echo
echo "── 1. Project persists ──"
curl -s -o /dev/null -c "$ALICE" -X POST "$CONSOLE/api/dev-login?user=alice"
create_code=$(curl -s -b "$ALICE" -o /dev/null -w '%{http_code}' -X POST "$CONSOLE/api/projects" \
  -H 'Content-Type: application/json' -d "{\"name\":\"M0 Demo\",\"slug\":\"$SLUG\",\"domain\":\"demo\"}")
[ "$create_code" = "201" ] && ok "POST /api/projects -> 201" || bad "POST /api/projects -> $create_code (expected 201)"
rows=$(psql "$DATABASE_URL" -tAc "SELECT count(*) FROM project WHERE slug='$SLUG'" 2>/dev/null)
[ "$rows" = "1" ] && ok "row present in Postgres (project.slug=$SLUG)" || bad "Postgres row count = '$rows' (expected 1)"

echo
echo "── 2. Router answers a hello (+ emits cost/latency) ──"
route_json=$(curl -s -b "$ALICE" --max-time 60 -X POST "$CONSOLE/api/route" \
  -H 'Content-Type: application/json' -d '{"prompt_key":"hello.greeting","project_id":"'"$SLUG"'"}')
text=$(echo "$route_json" | jget "['text']")
cost=$(echo "$route_json" | jget "['cost_usd']")
lat=$(echo "$route_json" | jget "['latency_ms']")
if [ -n "$text" ]; then ok "router replied: \"$text\""; else bad "no text in route response: $route_json"; fi
python3 -c "import sys; sys.exit(0 if float('${cost:-0}')>0 else 1)" \
  && ok "cost_usd > 0 ($cost)" || bad "cost_usd not > 0 ($cost)"
python3 -c "import sys; sys.exit(0 if float('${lat:-0}')>0 else 1)" \
  && ok "latency_ms > 0 ($lat)" || bad "latency_ms not > 0 ($lat)"

echo
echo "── 3. Cost + latency in the dashboard ──"
echo "  (waiting up to 12s for the fire-and-forget flush)"
dash_cost=0
for _ in $(seq 1 6); do
  sleep 2
  bj=$(curl -s "$COST/v1/stats/breakdown?apps=model-router")
  dash_cost=$(echo "$bj" | jget "['total_cost']")
  python3 -c "import sys; sys.exit(0 if float('${dash_cost:-0}')>0 else 1)" && break
done
python3 -c "import sys; sys.exit(0 if float('${dash_cost:-0}')>0 else 1)" \
  && ok "cost-tracker breakdown shows model-router cost ($dash_cost)" \
  || bad "no model-router cost in dashboard ($dash_cost)"
recent=$(curl -s "$COST/v1/events/recent?apps=model-router")
echo "$recent" | grep -q 'model-router' && ok "recent events include model-router" || bad "no recent model-router event"

echo
echo "── 4. RBAC blocks an unauthorised role ──"
curl -s -o /dev/null -c "$BOB" -X POST "$CONSOLE/api/dev-login?user=bob"
viewer_code=$(curl -s -b "$BOB" -o /dev/null -w '%{http_code}' -X POST "$CONSOLE/api/projects" \
  -H 'Content-Type: application/json' -d '{"name":"should fail","slug":"should-fail-'"$TS"'"}')
[ "$viewer_code" = "403" ] && ok "viewer POST /api/projects -> 403" || bad "viewer POST -> $viewer_code (expected 403)"
vrows=$(psql "$DATABASE_URL" -tAc "SELECT count(*) FROM project WHERE slug='should-fail-$TS'" 2>/dev/null)
[ "$vrows" = "0" ] && ok "blocked write did not persist" || bad "unexpected row for blocked write ($vrows)"

rm -rf "$JAR_DIR"
echo
echo "════════════════════════════════════════"
echo "  M0 verification: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════"
[ "$FAIL" -eq 0 ] && { echo "  ✅ M0 GREEN"; exit 0; } || { echo "  ❌ M0 not green"; exit 1; }
