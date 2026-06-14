#!/usr/bin/env bash
# Prove milestone M1 (golden thread): one project goes
#   scope -> kb_release -> agent_version -> deployment + eval_run
# with every step linked parent->child in the lineage, and a chat answer
# carrying {release_key, agent_version, item_id, revision_id, chunk_id}.
#
# Prereqs: infra up, migrations applied, and these running:
#   make router · make ground · make build-runtime · make eval · make dev
set -u

CONSOLE="${CONSOLE_URL:-http://localhost:3000}"
GROUND="${GROUND_URL:-http://localhost:8790}"
EVAL="${EVAL_URL:-http://localhost:8792}"
DB="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5433/agent_platform}"

TS="$(date +%s)"
SLUG="m1-demo-${TS}"
JAR="$(mktemp -d)/alice.jar"
PASS=0; FAIL=0
ok()  { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo "── Seed prompts ──"
bash "$(dirname "$0")/seed-phase1.sh" >/dev/null 2>&1 && echo "  seeded"

echo; echo "── Specify: topic -> scope + system_prompt + kb_outline ──"
curl -s -o /dev/null -c "$JAR" -X POST "$CONSOLE/api/dev-login?user=alice"
PID=$(curl -s -b "$JAR" -X POST "$CONSOLE/api/projects" -H 'Content-Type: application/json' \
  -d "{\"name\":\"M1 Demo\",\"slug\":\"$SLUG\",\"domain\":\"banking\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
[ -n "$PID" ] && ok "project created ($SLUG)" || { bad "project create failed"; }
spec_code=$(curl -s -b "$JAR" --max-time 90 -o /dev/null -w '%{http_code}' -X POST "$CONSOLE/api/specify" \
  -H 'Content-Type: application/json' -d "{\"projectId\":\"$PID\",\"topic\":\"A help assistant for UK current accounts\"}")
[ "$spec_code" = "201" ] && ok "specify -> 201" || bad "specify -> $spec_code"

echo; echo "── Ground: ingest docs + pin a release ──"
python3 - "$GROUND" "$PID" <<'PY'
import json, sys, urllib.request
ground, pid = sys.argv[1], sys.argv[2]
docs = [
  {"uri":"doc/overdraft","title":"Overdrafts","body":"# Overdrafts\n\nAn arranged overdraft lets you borrow up to an agreed limit.\n\n## Overdraft fees\n\nWe charge 39.9% EAR variable interest on arranged overdrafts. There is no fee for using an arranged overdraft below 50 pounds."},
  {"uri":"doc/switching","title":"Switching","body":"# Switching your account\n\nThe Current Account Switch Service moves your payments and balance within 7 working days and is covered by a guarantee."},
  {"uri":"doc/fees","title":"Account fees","body":"# Monthly account fees\n\nThe Classic Account has no monthly fee. The Club Lloyds account costs 3 pounds a month, waived if you pay in 2000 pounds a month."},
]
req = urllib.request.Request(f"{ground}/v1/ingest", data=json.dumps({"project_id":pid,"docs":docs}).encode(),
                             headers={"Content-Type":"application/json"})
r = json.load(urllib.request.urlopen(req, timeout=30))
print("  ingested items:", len(r["items"]))
PY
[ $? -eq 0 ] && ok "ground ingest" || bad "ground ingest failed"
KBOUT=$(psql "$DB" -tAc "SELECT id FROM artifact WHERE project_id='$PID' AND type='kb_outline' ORDER BY version DESC LIMIT 1")
RELKEY=$(curl -s --max-time 20 -X POST "$GROUND/v1/release" -H 'Content-Type: application/json' \
  -d "{\"project_id\":\"$PID\",\"kb_outline_artifact_id\":\"$KBOUT\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['release_key'])")
[ -n "$RELKEY" ] && ok "kb_release pinned ($RELKEY)" || bad "release failed"

echo; echo "── Build: agent_version, then Deploy ──"
AVID=$(curl -s -b "$JAR" --max-time 30 -X POST "$CONSOLE/api/agent/build" -H 'Content-Type: application/json' \
  -d "{\"projectId\":\"$PID\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['agent_version_id'])")
[ -n "$AVID" ] && ok "agent_version built" || bad "build failed"
dep_code=$(curl -s -b "$JAR" --max-time 15 -o /dev/null -w '%{http_code}' -X POST "$CONSOLE/api/deploy" \
  -H 'Content-Type: application/json' -d "{\"agentVersionId\":\"$AVID\"}")
[ "$dep_code" = "201" ] && ok "deploy -> 201" || bad "deploy -> $dep_code"

echo; echo "── Chat: answer carries the provenance tuple ──"
prov=$(curl -s -b "$JAR" --max-time 60 -X POST "$CONSOLE/api/chat" -H 'Content-Type: application/json' \
  -d "{\"agentVersionId\":\"$AVID\",\"question\":\"What is the overdraft interest rate?\"}" \
  | python3 -c "import sys,json
d=json.load(sys.stdin); p=d.get('provenance',{})
need=['release_key','agent_version','item_id','revision_id','chunk_id']
ok=all(p.get(k) is not None for k in need)
print('OK' if ok else 'MISSING', json.dumps(p))")
echo "  provenance: $prov"
[ "${prov%% *}" = "OK" ] && ok "answer carries {release_key,agent_version,item_id,revision_id,chunk_id}" || bad "incomplete provenance tuple"

echo; echo "── Evaluate: eval_run with a gate result ──"
gate=$(curl -s --max-time 120 -X POST "$EVAL/v1/eval" -H 'Content-Type: application/json' \
  -d "{\"agent_version_id\":\"$AVID\"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['gateResult'],d['metrics']['quality'])")
[ -n "$gate" ] && ok "eval_run produced (gate=$gate)" || bad "eval failed"

echo; echo "── Lineage DAG: the five artifacts linked parent->child ──"
edges=$(psql "$DB" -tAc "SELECT count(*) FROM artifact_parent ap
  JOIN artifact c ON c.id=ap.child_id JOIN artifact p ON p.id=ap.parent_id
  WHERE c.project_id='$PID' AND (
    (c.type='system_prompt' AND p.type='scope') OR
    (c.type='kb_outline'    AND p.type='scope') OR
    (c.type='kb_release'    AND p.type='kb_outline') OR
    (c.type='agent_version' AND p.type='system_prompt') OR
    (c.type='agent_version' AND p.type='kb_release') OR
    (c.type='deployment'    AND p.type='agent_version') OR
    (c.type='eval_run'      AND p.type='agent_version'));")
[ "$edges" = "7" ] && ok "all 7 golden-thread edges present" || bad "expected 7 edges, found $edges"

echo
echo "════════════════════════════════════════"
echo "  M1 verification: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════"
[ "$FAIL" -eq 0 ] && { echo "  ✅ M1 GREEN — golden thread end-to-end"; exit 0; } || { echo "  ❌ M1 not green"; exit 1; }
