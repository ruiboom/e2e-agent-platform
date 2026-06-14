"""Neo4j graph projection + LLM graph-enricher (H7).

Extracts entities + relationships from chunks (via the model router) and writes
them to Neo4j: (Entity)-[:MENTIONS]->(Chunk) and (Entity)-[:RELATED]->(Entity).
The graph + graph_hybrid retrieval modes traverse this graph when Neo4j is
available + enriched; otherwise Ground falls back to the in-Postgres entity index.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx
from neo4j import GraphDatabase

NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "password123")
ROUTER_URL = os.environ.get("MODEL_ROUTER_URL", "http://localhost:8789").rstrip("/")

_UNSET: Any = object()
_DRIVER: Any = _UNSET


def _driver():
    global _DRIVER
    if _DRIVER is _UNSET:
        try:
            d = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
            d.verify_connectivity()
            _DRIVER = d
        except Exception:
            _DRIVER = None
    return _DRIVER


def available() -> bool:
    return _driver() is not None


def _parse(text: str) -> dict:
    m = re.search(r"\{.*\}", text, re.S)
    try:
        return json.loads(m.group(0)) if m else {}
    except Exception:
        return {}


def _write(tx, project_id, chunk_id, item_id, data):
    tx.run("MERGE (ch:Chunk {id:$cid}) SET ch.project=$pid, ch.item=$iid",
           cid=chunk_id, pid=project_id, iid=item_id)
    for ent in data.get("entities", []):
        name = (ent if isinstance(ent, str) else ent.get("name", "")).strip().lower()
        if not name:
            continue
        tx.run("MERGE (e:Entity {name:$n, project:$pid}) WITH e "
               "MATCH (ch:Chunk {id:$cid}) MERGE (e)-[:MENTIONS]->(ch)",
               n=name, pid=project_id, cid=chunk_id)
    for rel in data.get("relationships", []):
        s = str(rel.get("source", "")).strip().lower()
        t = str(rel.get("target", "")).strip().lower()
        ty = str(rel.get("type", "related")).strip()
        if s and t:
            tx.run("MERGE (a:Entity {name:$s, project:$pid}) "
                   "MERGE (b:Entity {name:$t, project:$pid}) MERGE (a)-[:RELATED {type:$ty}]->(b)",
                   s=s, t=t, pid=project_id, ty=ty)


def enrich_chunks(project_id: str, chunks: list[dict[str, Any]]) -> dict[str, Any]:
    drv = _driver()
    if drv is None:
        return {"enriched": 0, "available": False}
    n = 0
    with httpx.Client(timeout=90.0) as client, drv.session() as session:
        for c in chunks:
            try:
                r = client.post(f"{ROUTER_URL}/v1/route",
                                json={"prompt_key": "graph.enrich", "vars": {"text": c["body"]}, "project_id": project_id})
                data = _parse(r.json()["text"])
            except Exception:
                data = {}
            session.execute_write(_write, project_id, c["chunk_id"], c["item_id"], data)
            n += 1
    return {"enriched": n, "available": True}


def graph_candidates(project_id: str, query_entities: list[str], chunk_ids: list[str], n: int) -> list[tuple[str, float]]:
    """graph lookup (entities -> chunks) ∪ 1-hop traverse (entities -> RELATED -> chunks)."""
    drv = _driver()
    if drv is None or not query_entities or not chunk_ids:
        return []
    ents = [e.lower() for e in query_entities]
    with drv.session() as session:
        lookup = session.run(
            "MATCH (e:Entity {project:$pid})-[:MENTIONS]->(ch:Chunk) "
            "WHERE e.name IN $ents AND ch.id IN $cids "
            "RETURN ch.id AS chunk_id, count(e) AS score ORDER BY score DESC LIMIT $n",
            pid=project_id, ents=ents, cids=chunk_ids, n=n).data()
        traverse = session.run(
            "MATCH (e:Entity {project:$pid})-[:RELATED]-(rel:Entity)-[:MENTIONS]->(ch:Chunk) "
            "WHERE e.name IN $ents AND ch.id IN $cids AND NOT rel.name IN $ents "
            "RETURN ch.id AS chunk_id, count(DISTINCT rel) AS score ORDER BY score DESC LIMIT $n",
            pid=project_id, ents=ents, cids=chunk_ids, n=n).data()
    scores: dict[str, float] = {}
    for row in lookup:
        scores[row["chunk_id"]] = scores.get(row["chunk_id"], 0.0) + float(row["score"])
    for row in traverse:                       # traverse contributes at half weight
        scores[row["chunk_id"]] = scores.get(row["chunk_id"], 0.0) + 0.5 * float(row["score"])
    ranked = sorted(scores.items(), key=lambda kv: -kv[1])
    mx = ranked[0][1] if ranked else 1.0
    return [(cid, s / mx) for cid, s in ranked[:n]]


def stats(project_id: str) -> dict[str, int]:
    drv = _driver()
    if drv is None:
        return {"entities": 0, "relationships": 0}
    with drv.session() as session:
        e = session.run("MATCH (e:Entity {project:$p}) RETURN count(e) AS c", p=project_id).single()["c"]
        r = session.run("MATCH (:Entity {project:$p})-[r:RELATED]->(:Entity {project:$p}) RETURN count(r) AS c",
                        p=project_id).single()["c"]
    return {"entities": e, "relationships": r}
