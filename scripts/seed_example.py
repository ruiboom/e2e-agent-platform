"""Seed ONE complete example project so every stage has real, explorable outputs.

Builds the 'Overdraft Assistant' end-to-end: Discover -> Define (signed) ->
Specify -> Architect (hybrid + graph) -> Plan -> Gate 1 -> Ground (governed +
graph-enriched release) -> Build -> Test -> Evaluate -> Gate 2 -> Deploy -> a few
chats -> Operate (an improvement proposal). Run after scripts/reset-data.sh.
"""
import http.cookiejar
import json
import os
import time
import urllib.request

import psycopg

CONSOLE = os.environ.get("CONSOLE_URL", "http://localhost:3000")
GROUND = os.environ.get("GROUND_URL", "http://localhost:8790")
EVAL = os.environ.get("EVAL_URL", "http://localhost:8792")
OPTIMISE = os.environ.get("OPTIMISE_URL", "http://localhost:8793")
DB = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/agent_platform")
SLUG = "overdraft-assistant"

cj = http.cookiejar.CookieJar()
console = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def call(url, body, opener=None, timeout=180, ok=(200, 201)):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        r = (opener.open if opener else urllib.request.urlopen)(req, timeout=timeout)
        return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")[:200]
        raise SystemExit(f"FAILED {url} -> {e.code}: {detail}")


def step(msg):
    print(f"  · {msg}")


console.open(urllib.request.Request(f"{CONSOLE}/api/dev-login?user=alice", data=b"", method="POST"))
proj = call(f"{CONSOLE}/api/projects",
            {"name": "Overdraft Assistant", "slug": SLUG, "domain": "retail-banking"}, console)
pid = proj["id"]
step(f"project {SLUG} ({pid[:8]})")

# ── Shape & plan ──
call(f"{CONSOLE}/api/shape", {"action": "discover", "projectId": pid,
     "problem": "Retail current-account customers frequently misunderstand how arranged overdraft "
                "interest and fees work, driving avoidable charges and complaints."}, console)
call(f"{CONSOLE}/api/shape", {"action": "define", "projectId": pid}, console)
call(f"{CONSOLE}/api/shape", {"action": "signoff", "projectId": pid}, console)
step("Discover -> Define -> signed off")

call(f"{CONSOLE}/api/specify", {"projectId": pid,
     "topic": "A help assistant for UK personal current-account overdrafts: interest, fees, "
              "switching, and eligibility"}, console)
step("Specify -> scope / system_prompt / kb_outline")

call(f"{CONSOLE}/api/shape", {"action": "architect", "projectId": pid, "adr": {
     "buildParadigm": "code", "runtime": "rag-v1", "retrievalStrategy": "hybrid",
     "storageProjections": ["pgvector", "neo4j"], "channels": ["web"],
     "deployTarget": "local", "guardrailPolicyRef": "default"}}, console)
call(f"{CONSOLE}/api/shape", {"action": "plan", "projectId": pid}, console)
call(f"{CONSOLE}/api/shape", {"action": "gate1", "projectId": pid}, console)
step("Architect (hybrid+graph) -> Plan -> Gate 1")

# ── Ground (bob submits, alice approves — four-eyes) ──
DOCS = [
    {"uri": "kb/overdraft-fees", "title": "Overdraft interest & fees", "body":
     "# Arranged overdraft interest\n\nWe charge 39.9% EAR (variable) on arranged overdrafts. "
     "Interest accrues daily on the amount you are overdrawn and is charged monthly.\n\n"
     "## Fee-free buffer\n\nThere is no interest or fee while you are overdrawn by 50 pounds or less. "
     "Above 50 pounds, the 39.9% EAR rate applies to the whole overdrawn balance."},
    {"uri": "kb/unarranged", "title": "Unarranged overdrafts", "body":
     "# Unarranged overdrafts\n\nIf you spend more than your arranged limit you are in an unarranged "
     "overdraft. We may decline the payment. We do not charge unpaid-transaction fees, but interest "
     "still applies at 39.9% EAR on the overdrawn balance."},
    {"uri": "kb/switching", "title": "Switching your account", "body":
     "# Switching your account\n\nThe Current Account Switch Service (CASS) moves your balance, "
     "direct debits and standing orders to your new account within 7 working days. It is covered by "
     "the Current Account Switch Guarantee, so any errors are refunded."},
    {"uri": "kb/eligibility", "title": "Overdraft eligibility", "body":
     "# Overdraft eligibility\n\nAn arranged overdraft is subject to status and a credit assessment. "
     "You must be 18 or over and a UK resident. Your arranged limit depends on your circumstances; "
     "we will tell you the limit you are offered before you accept it."},
    {"uri": "kb/help", "title": "Managing an overdraft", "body":
     "# Managing your overdraft\n\nYou can reduce overdraft interest by paying in more often, setting "
     "low-balance alerts, or moving to a planned repayment. If you are in financial difficulty we can "
     "discuss options including a repayment plan and pausing interest."},
]
ing = call(f"{GROUND}/v1/ingest", {"project_id": pid, "submitted_by": "bob", "docs": DOCS})
for it in ing["items"]:
    call(f"{GROUND}/v1/approve", {"revision_id": it["revision_id"], "approver": "alice"})
step(f"Ground: ingested {len(ing['items'])} docs (bob) + approved (alice)")
with psycopg.connect(DB) as c:
    kbout = str(c.execute("SELECT id FROM artifact WHERE project_id=%s AND type='kb_outline' "
                          "ORDER BY version DESC LIMIT 1", (pid,)).fetchone()[0])
rel = call(f"{GROUND}/v1/release", {"project_id": pid, "kb_outline_artifact_id": kbout})
enr = call(f"{GROUND}/v1/enrich", {"project_id": pid, "release_key": rel["release_key"]})
step(f"release {rel['release_key']} + graph ({enr.get('graph', {}).get('entities')} entities)")

# ── Build -> Test -> Evaluate -> Gate 2 -> Deploy ──
av = call(f"{CONSOLE}/api/agent/build", {"projectId": pid}, console)
avid = av["agent_version_id"]
step(f"Build: agent_version v{av['version']} ({av['build_paradigm']}, hybrid retrieval)")
ts = call(f"{EVAL}/v1/testsuite", {"agent_version_id": avid})
ev = call(f"{EVAL}/v1/run-suite", {"agent_version_id": avid, "test_suite_id": ts["test_suite_id"]})
step(f"Test ({ts['cases']} cases) -> Eval quality={ev['metrics']['quality']} ({ev['gateResult']})")
call(f"{EVAL}/v1/policy", {"project_id": pid,
     "pre_deploy_gates": {"quality": 0.5, "latency_ms": 12000, "cost_usd": 0.5}})
call(f"{CONSOLE}/api/deploy", {"agentVersionId": avid, "target": "local", "channels": ["web"]}, console)
step("Gate 2 passed -> Deployed (local / web, guardrails on)")

# ── A few live chats (provenance + chat_log) ──
for q in ["What interest do you charge on an arranged overdraft?",
          "Is there a fee if I'm only a few pounds overdrawn?",
          "How long does switching my account take?",
          "Can you tell me today's weather?"]:
    call(f"{CONSOLE}/api/chat", {"agentVersionId": avid, "question": q}, console, timeout=90)
step("4 chats logged (incl. one off-topic, for the operate loop)")

# ── Operate (close the loop) ──
op = call(f"{OPTIMISE}/v1/operate", {"agent_version_id": avid})
step(f"Operate: {op.get('status')} — improved system_prompt v{op.get('new_version')}")

with psycopg.connect(DB) as c:
    n = c.execute("SELECT count(*) FROM artifact WHERE project_id=%s", (pid,)).fetchone()[0]
print(f"\n✅ Example project ready: {n} artifacts across all stages.")
print(f"   Open  http://localhost:3000/projects/{SLUG}")
