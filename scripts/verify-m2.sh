#!/usr/bin/env bash
# Prove milestone M2 (front of funnel): idea -> opportunity -> proposition
# (Gate 1) -> scope -> adr -> plan, all linked; Gate 1 blocks until signed off.
set -u
CONSOLE="${CONSOLE_URL:-http://localhost:3000}"
DB="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5433/agent_platform}"
TS="$(date +%s)"; SLUG="m2-demo-${TS}"; JAR="$(mktemp -d)/alice.jar"
PASS=0; FAIL=0
ok()  { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
shape() { curl -s -b "$JAR" --max-time 90 -X POST "$CONSOLE/api/shape" -H 'Content-Type: application/json' -d "$1"; }

bash "$(dirname "$0")/seed-phase1.sh" >/dev/null 2>&1
bash "$(dirname "$0")/seed-phase2.sh" >/dev/null 2>&1
echo "  prompts seeded"

curl -s -o /dev/null -c "$JAR" -X POST "$CONSOLE/api/dev-login?user=alice"
PID=$(curl -s -b "$JAR" -X POST "$CONSOLE/api/projects" -H 'Content-Type: application/json' \
  -d "{\"name\":\"M2 Demo\",\"slug\":\"$SLUG\",\"domain\":\"banking\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

echo; echo "── Discover -> Define ──"
shape "{\"action\":\"discover\",\"projectId\":\"$PID\",\"problem\":\"Customers struggle to understand overdraft fees on current accounts\"}" >/dev/null && ok "opportunity emitted"
shape "{\"action\":\"define\",\"projectId\":\"$PID\"}" >/dev/null && ok "proposition (draft) emitted"

echo; echo "── Gate 1 blocks before sign-off ──"
g1=$(shape "{\"action\":\"gate1\",\"projectId\":\"$PID\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['pass'])")
[ "$g1" = "False" ] && ok "Gate 1 blocked (proposition not signed off)" || bad "Gate 1 should block, got pass=$g1"

echo; echo "── Sign off -> Specify -> Architect -> Plan ──"
so=$(shape "{\"action\":\"signoff\",\"projectId\":\"$PID\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['status'])")
[ "$so" = "signed_off" ] && ok "proposition signed off" || bad "signoff -> $so"
spec=$(curl -s -b "$JAR" --max-time 90 -o /dev/null -w '%{http_code}' -X POST "$CONSOLE/api/specify" \
  -H 'Content-Type: application/json' -d "{\"projectId\":\"$PID\",\"topic\":\"UK current account overdraft help\"}")
[ "$spec" = "201" ] && ok "scope/system_prompt/kb_outline emitted" || bad "specify -> $spec"

# invalid ADR (graph retrieval, no neo4j projection) must be rejected
inv=$(shape "{\"action\":\"architect\",\"projectId\":\"$PID\",\"adr\":{\"buildParadigm\":\"code\",\"retrievalStrategy\":\"graph\",\"storageProjections\":[\"pgvector\"]}}" | python3 -c "import sys,json;print('error' in json.load(sys.stdin))")
[ "$inv" = "True" ] && ok "invalid ADR (graph w/o neo4j) rejected" || bad "invalid ADR was not rejected"

shape "{\"action\":\"architect\",\"projectId\":\"$PID\",\"adr\":{\"buildParadigm\":\"code\",\"runtime\":\"rag-v1\",\"retrievalStrategy\":\"vector\",\"storageProjections\":[\"pgvector\"],\"channels\":[\"web\"],\"deployTarget\":\"local\"}}" >/dev/null && ok "adr emitted"
shape "{\"action\":\"plan\",\"projectId\":\"$PID\"}" >/dev/null && ok "plan emitted"

echo; echo "── Gate 1 passes ──"
g2=$(shape "{\"action\":\"gate1\",\"projectId\":\"$PID\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['pass'])")
[ "$g2" = "True" ] && ok "Gate 1 passes (signed off + adr)" || bad "Gate 1 should pass, got $g2"

echo; echo "── Lineage chain ──"
edges=$(psql "$DB" -tAc "SELECT count(*) FROM artifact_parent ap
  JOIN artifact c ON c.id=ap.child_id JOIN artifact p ON p.id=ap.parent_id
  WHERE c.project_id='$PID' AND (
    (c.type='proposition'  AND p.type='opportunity') OR
    (c.type='scope'        AND p.type='proposition') OR
    (c.type='adr'          AND p.type='scope') OR
    (c.type='plan'         AND p.type='scope') OR
    (c.type='plan'         AND p.type='adr') OR
    (c.type='gate1'        AND p.type='proposition') OR
    (c.type='gate1'        AND p.type='adr'));")
[ "$edges" = "7" ] && ok "all 7 shape-&-plan edges present" || bad "expected 7 edges, found $edges"

echo
echo "════════════════════════════════════════"
echo "  M2 verification: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════"
[ "$FAIL" -eq 0 ] && { echo "  ✅ M2 GREEN"; exit 0; } || { echo "  ❌ M2 not green"; exit 1; }
