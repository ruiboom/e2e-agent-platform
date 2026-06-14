"""H4 verification — validated PII detection (Presidio + checksum regex) + I/O redaction.

Proves: Presidio is active; NER entities + checksum-validated cards/IBAN are
detected; invalid cards are rejected (Luhn); input PII is redacted before the
model; the runtime returns input + output PII guardrail signals.
"""
import http.cookiejar
import json
import os
import time
import urllib.request

import psycopg

from governance import pii_engine, redact_pii, scan_pii

CONSOLE = os.environ.get("CONSOLE_URL", "http://localhost:3000")
GROUND = os.environ.get("GROUND_URL", "http://localhost:8790")
DB = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/agent_platform")

PASS = FAIL = 0
ok = lambda m: (globals().__setitem__("PASS", PASS + 1), print(f"  ✓ {m}"))  # noqa: E731
bad = lambda m: (globals().__setitem__("FAIL", FAIL + 1), print(f"  ✗ {m}"))  # noqa: E731


def post(url, body, opener=None, timeout=120):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    op = opener.open if opener else urllib.request.urlopen
    try:
        r = op(req, timeout=timeout)
        return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


print("── Detector (Presidio + validated regex) ──")
ok(f"Presidio active: engine={pii_engine()}") if pii_engine() == "presidio+regex" else bad(f"Presidio not active: {pii_engine()}")
res = scan_pii("Email john@example.com, card 4111 1111 1111 1111, contact Jane Doe in London.")
types = {f["type"] for f in res.findings}
ok(f"detects NER + validated entities: {sorted(types)}") if {"person", "email"} <= types and ("card" in types or "credit_card" in types) else bad(f"missing entities: {sorted(types)}")
inv = {f["type"] for f in scan_pii("ref 1234 5678 9012 3456 only").findings}
ok("Luhn rejects an invalid card number") if "card" not in inv else bad("invalid card flagged as card")
red, _ = redact_pii("my email is john@example.com")
ok(f"redaction works: '{red}'") if "john@example.com" not in red and "[" in red else bad(f"redaction failed: {red}")

print("\n── Ingest-time scan ──")
cj = http.cookiejar.CookieJar()
console = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
console.open(urllib.request.Request(f"{CONSOLE}/api/dev-login?user=alice", data=b"", method="POST"))
slug = f"h-pii-{int(time.time())}"
_, proj = post(f"{CONSOLE}/api/projects", {"name": "H PII", "slug": slug, "domain": "banking"}, console)
pid = proj["id"]
post(f"{CONSOLE}/api/specify", {"projectId": pid, "topic": "UK current account overdraft help"}, console)
_, ing = post(f"{GROUND}/v1/ingest", {"project_id": pid, "submitted_by": "bob", "docs": [
    {"uri": "doc/pii", "title": "Contact",
     "body": "# Overdraft\n\n39.9% EAR. For help email support@bank.example or John Smith."}]})
rid = ing["items"][0]["revision_id"]
with psycopg.connect(DB) as c:
    scan = c.execute("SELECT scan_results FROM kb_revision WHERE id=%s", (rid,)).fetchone()[0]
ok(f"ingest captured scan_results ({len(scan.get('pii', []))} PII finding(s))") if scan.get("pii") else bad(f"no scan on ingest: {scan}")

print("\n── Runtime I/O redaction ──")
post(f"{GROUND}/v1/approve", {"revision_id": rid, "approver": "alice"})
with psycopg.connect(DB) as c:
    kbout = str(c.execute("SELECT id FROM artifact WHERE project_id=%s AND type='kb_outline' ORDER BY version DESC LIMIT 1", (pid,)).fetchone()[0])
post(f"{GROUND}/v1/release", {"project_id": pid, "kb_outline_artifact_id": kbout})
_, av = post(f"{CONSOLE}/api/agent/build", {"projectId": pid}, console)
_, chat = post(f"{CONSOLE}/api/chat", {"agentVersionId": av["agent_version_id"],
               "question": "My card is 4111 1111 1111 1111 and email john@example.com — what's the overdraft rate?"}, console)
g = chat.get("guardrails", {})
ok(f"input PII redacted before model (pii_redactions={g.get('pii_redactions')})") if g.get("pii_redactions", 0) >= 1 else bad(f"input PII not redacted: {g}")
ok("output PII guardrail present + no card leaked in answer") if "output_pii" in g and "4111 1111 1111 1111" not in chat.get("answer", "") else bad(f"output guard missing/leak: {g}")

print("\n" + "=" * 40)
print(f"  H4 (PII) verification: {PASS} passed, {FAIL} failed")
print("=" * 40)
print("  ✅ H4 GREEN" if FAIL == 0 else "  ❌ H4 not green")
raise SystemExit(0 if FAIL == 0 else 1)
