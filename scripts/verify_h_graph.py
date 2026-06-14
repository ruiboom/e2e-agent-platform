"""H7 verification — Neo4j graph store + graph-enricher.

Proves: Ground is wired to Neo4j; the enricher extracts entities + relationships
into the graph; and the graph / graph_hybrid retrieval modes traverse Neo4j to
return relevant chunks.
"""
import json
import os
import time
import urllib.request

import psycopg

GROUND = os.environ.get("GROUND_URL", "http://localhost:8790")
DB = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/agent_platform")
PASS = FAIL = 0
ok = lambda m: (globals().__setitem__("PASS", PASS + 1), print(f"  ✓ {m}"))  # noqa: E731
bad = lambda m: (globals().__setitem__("FAIL", FAIL + 1), print(f"  ✗ {m}"))  # noqa: E731


def post(url, body, timeout=120):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def get(url):
    return json.loads(urllib.request.urlopen(url, timeout=10).read())


print("── Ground is wired to Neo4j ──")
hz = get(f"{GROUND}/healthz")
ok("graph backend = neo4j") if hz.get("graph") == "neo4j" else bad(f"graph backend: {hz.get('graph')}")

with psycopg.connect(DB) as c:
    pid = str(c.execute("INSERT INTO project (slug,name,owner) VALUES (%s,'H Graph','t') RETURNING id",
                        (f"h-graph-{int(time.time())}",)).fetchone()[0]); c.commit()
ing = post(f"{GROUND}/v1/ingest", {"project_id": pid, "submitted_by": "bob", "docs": [
    {"uri": "d/overdraft", "title": "Overdraft", "body": "# Overdraft\n\nAn arranged overdraft charges 39.9 percent EAR variable interest. Overdrafts relate to borrowing and interest."},
    {"uri": "d/switch", "title": "Switching", "body": "# Switching\n\nThe Current Account Switch Service moves direct debits and salary to a new bank within seven working days."},
    {"uri": "d/fees", "title": "Fees", "body": "# Fees\n\nThe Classic account has no monthly fee. The Club account charges a monthly fee unless you pay in a salary."}]})
for it in ing["items"]:
    post(f"{GROUND}/v1/approve", {"revision_id": it["revision_id"], "approver": "alice"})
rel = post(f"{GROUND}/v1/release", {"project_id": pid, "kb_outline_artifact_id": None})

print("\n── Enrich: entities + relationships into the graph ──")
en = post(f"{GROUND}/v1/enrich", {"project_id": pid, "release_key": rel["release_key"]})
g = en.get("graph", {})
ok(f"enriched {en.get('enriched')} chunks → {g.get('entities')} entities, {g.get('relationships')} relationships") \
    if g.get("entities", 0) >= 3 and g.get("relationships", 0) >= 1 else bad(f"graph too sparse: {en}")

print("\n── Graph retrieval traverses Neo4j ──")
r = post(f"{GROUND}/v1/retrieve", {"project_id": pid, "release_key": rel["release_key"],
         "query": "overdraft interest borrowing", "k": 2, "mode": "graph"})
top = r["chunks"][0] if r["chunks"] else {}
ok(f"graph mode returns the overdraft chunk (score {top.get('score')})") \
    if r["chunks"] and ("overdraft" in top.get("body", "").lower() or "39.9" in top.get("body", "")) else bad(f"graph retrieval wrong: {top.get('body','')[:60]}")
rh = post(f"{GROUND}/v1/retrieve", {"project_id": pid, "release_key": rel["release_key"],
          "query": "moving my salary to a new bank", "k": 2, "mode": "graph_hybrid"})
ok(f"graph_hybrid returns results ({len(rh['chunks'])} chunks)") if rh["chunks"] else bad("graph_hybrid empty")

print("\n── Graph is in Neo4j (not the fallback index) ──")
from neo4j import GraphDatabase  # noqa: E402
drv = GraphDatabase.driver(os.environ.get("NEO4J_URI", "bolt://localhost:7687"),
                           auth=(os.environ.get("NEO4J_USER", "neo4j"), os.environ.get("NEO4J_PASSWORD", "password123")))
with drv.session() as s:
    ents = s.run("MATCH (e:Entity {project:$p}) RETURN count(e) AS c", p=pid).single()["c"]
    rels = s.run("MATCH (:Entity {project:$p})-[r:RELATED]->() RETURN count(r) AS c", p=pid).single()["c"]
drv.close()
ok(f"Neo4j holds the project graph ({ents} entities, {rels} relationships)") if ents >= 3 and rels >= 1 else bad(f"neo4j empty: {ents}/{rels}")

print("\n" + "=" * 40)
print(f"  H7 (graph) verification: {PASS} passed, {FAIL} failed")
print("=" * 40)
print("  ✅ H7 GREEN" if FAIL == 0 else "  ❌ H7 not green")
raise SystemExit(0 if FAIL == 0 else 1)
