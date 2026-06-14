"""Canonical store: ingest (governed), approve (four-eyes), release, retrieve.

Phase 3 adds:
  - four-eyes governance: revisions are 'submitted', approved by a different
    actor; releases pin only 'approved' revisions; ingest runs safety scans.
  - six retrieval modes selectable per agent_version: vector, lexical,
    hybrid (RRF), graph, graph_hybrid (entity index for the graph modes).
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text

from governance import scan_injection, scan_pii
from lineage import LineageClient
from providers import embed, to_pgvector

from app.chunk import chunk_markdown
from app.db import get_engine

_lineage: LineageClient | None = None

_STOP = {
    "the", "and", "for", "with", "you", "your", "are", "this", "that", "from", "have",
    "will", "can", "not", "but", "any", "our", "use", "using", "into", "per", "via",
}


def _lin() -> LineageClient:
    global _lineage
    if _lineage is None:
        _lineage = LineageClient.from_database_url()
    return _lineage


def _sha(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def _entities(text_: str, top: int = 8) -> list[str]:
    freq: dict[str, int] = {}
    for tok in re.findall(r"[a-z][a-z0-9]{3,}", text_.lower()):
        if tok in _STOP:
            continue
        freq[tok] = freq.get(tok, 0) + 1
    return [w for w, _ in sorted(freq.items(), key=lambda kv: -kv[1])[:top]]


# ── Ingest (governed) ───────────────────────────────────────────────────
def ingest(project_id: str, docs: list[dict[str, Any]], submitted_by: str = "ingest") -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    with get_engine().begin() as conn:
        for doc in docs:
            uri, body = doc["uri"], doc["body"]
            chash = _sha(body)
            item_id = conn.execute(
                text("SELECT id FROM kb_item WHERE project_id=:p AND uri=:u"), {"p": project_id, "u": uri}
            ).scalar()
            if item_id is None:
                item_id = conn.execute(
                    text("INSERT INTO kb_item (project_id, uri, title) VALUES (:p,:u,:t) RETURNING id"),
                    {"p": project_id, "u": uri, "t": doc.get("title")},
                ).scalar_one()

            latest = conn.execute(
                text("SELECT id, content_hash FROM kb_revision WHERE item_id=:i ORDER BY rev_number DESC LIMIT 1"),
                {"i": item_id},
            ).first()
            if latest and latest.content_hash == chash:
                results.append({"item_id": str(item_id), "revision_id": str(latest.id), "state": "unchanged"})
                continue

            scan = {"pii": scan_pii(body).findings, "injection": scan_injection(body).findings}
            rev_n = conn.execute(
                text("SELECT COALESCE(MAX(rev_number),0)+1 FROM kb_revision WHERE item_id=:i"), {"i": item_id}
            ).scalar_one()
            rev_id = conn.execute(
                text(
                    "INSERT INTO kb_revision (item_id, rev_number, body, content_hash, state, submitted_by, scan_results) "
                    "VALUES (:i,:n,:b,:h,'submitted',:sb, CAST(:sr AS jsonb)) RETURNING id"
                ),
                {"i": item_id, "n": rev_n, "b": body, "h": chash, "sb": submitted_by, "sr": json.dumps(scan)},
            ).scalar_one()

            chunks = chunk_markdown(body)
            vectors = embed([c[1] for c in chunks]) if chunks else []
            for idx, ((heading, ctext), vec) in enumerate(zip(chunks, vectors)):
                chunk_id = conn.execute(
                    text(
                        "INSERT INTO kb_chunk (revision_id, chunk_index, heading_path, body, embedding) "
                        "VALUES (:r,:idx,:h,:b, CAST(:e AS vector)) RETURNING id"
                    ),
                    {"r": rev_id, "idx": idx, "h": heading, "b": ctext, "e": to_pgvector(vec)},
                ).scalar_one()
                for ent in _entities(f"{heading} {ctext}"):
                    conn.execute(
                        text("INSERT INTO kb_chunk_entity (chunk_id, entity) VALUES (:c,:e) ON CONFLICT DO NOTHING"),
                        {"c": chunk_id, "e": ent},
                    )
            results.append({"item_id": str(item_id), "revision_id": str(rev_id), "state": "submitted", "chunks": len(chunks)})
    return results


def approve(revision_id: str, approver: str) -> dict[str, Any]:
    with get_engine().begin() as conn:
        row = conn.execute(
            text("SELECT state, submitted_by FROM kb_revision WHERE id=:r"), {"r": revision_id}
        ).first()
        if not row:
            raise ValueError("revision not found")
        if row.state == "approved":
            return {"revision_id": revision_id, "state": "approved"}
        if approver and row.submitted_by and approver == row.submitted_by:
            raise ValueError("four-eyes: approver must differ from submitter")
        conn.execute(
            text("UPDATE kb_revision SET state='approved', approved_by=:a WHERE id=:r"),
            {"a": approver, "r": revision_id},
        )
        return {"revision_id": revision_id, "state": "approved", "approved_by": approver}


# ── Release (approved-only) ───────────────────────────────────────────────
def create_release(project_id: str, kb_outline_artifact_id: str | None) -> dict[str, Any]:
    with get_engine().begin() as conn:
        rows = conn.execute(
            text(
                "SELECT i.id AS item_id, r.id AS revision_id FROM kb_item i "
                "JOIN LATERAL (SELECT id FROM kb_revision WHERE item_id=i.id AND state='approved' "
                "             ORDER BY rev_number DESC LIMIT 1) r ON true WHERE i.project_id=:p"
            ),
            {"p": project_id},
        ).all()
        item_revisions = [{"item_id": str(x.item_id), "revision_id": str(x.revision_id)} for x in rows]
        content_hash = _sha("|".join(sorted(ir["revision_id"] for ir in item_revisions)))
        n = conn.execute(text("SELECT COUNT(*) FROM kb_release WHERE project_id=:p"), {"p": project_id}).scalar_one()
        release_key = f"kb-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{n + 1}"
        conn.execute(
            text(
                "INSERT INTO kb_release (project_id, release_key, item_revisions, content_hash) "
                "VALUES (:p,:k, CAST(:ir AS jsonb), :h)"
            ),
            {"p": project_id, "k": release_key, "ir": json.dumps(item_revisions), "h": content_hash},
        )
    artifact = _lin().create_artifact(
        project_id=project_id, type="kb_release",
        payload={"release_key": release_key, "item_revisions": item_revisions,
                 "content_hash": content_hash, "retrieval_indexes": ["pgvector", "tsvector", "entity"]},
        created_by="ground", parents=[kb_outline_artifact_id] if kb_outline_artifact_id else [],
    )
    return {"release_key": release_key, "kb_release_artifact_id": artifact.id, "item_count": len(item_revisions)}


# ── Retrieval (six modes) ─────────────────────────────────────────────────
def _release_revs(conn, project_id: str, release_key: str) -> list[str]:
    rel = conn.execute(
        text("SELECT item_revisions FROM kb_release WHERE project_id=:p AND release_key=:k"),
        {"p": project_id, "k": release_key},
    ).first()
    return [ir["revision_id"] for ir in rel.item_revisions] if rel else []


def _cand_vector(conn, revs, query, n):
    qv = to_pgvector(embed([query])[0])
    rows = conn.execute(
        text("SELECT id, 1-(embedding <=> CAST(:qv AS vector)) AS s FROM kb_chunk "
             "WHERE revision_id::text = ANY(:revs) ORDER BY embedding <=> CAST(:qv AS vector) LIMIT :n"),
        {"qv": qv, "revs": revs, "n": n},
    ).all()
    return [(str(r.id), float(r.s)) for r in rows]


def _cand_lexical(conn, revs, query, n):
    rows = conn.execute(
        text("SELECT id, ts_rank(to_tsvector('english', body), plainto_tsquery('english', :q)) AS s "
             "FROM kb_chunk WHERE revision_id::text = ANY(:revs) "
             "AND to_tsvector('english', body) @@ plainto_tsquery('english', :q) "
             "ORDER BY s DESC LIMIT :n"),
        {"q": query, "revs": revs, "n": n},
    ).all()
    return [(str(r.id), float(r.s)) for r in rows]


def _cand_graph(conn, revs, query, n):
    ents = _entities(query)
    if not ents:
        return []
    rows = conn.execute(
        text("SELECT c.id, count(ce.entity) AS overlap FROM kb_chunk c "
             "JOIN kb_chunk_entity ce ON ce.chunk_id=c.id "
             "WHERE c.revision_id::text = ANY(:revs) AND ce.entity = ANY(:ents) "
             "GROUP BY c.id ORDER BY overlap DESC LIMIT :n"),
        {"revs": revs, "ents": ents, "n": n},
    ).all()
    maxo = max((r.overlap for r in rows), default=1)
    return [(str(r.id), r.overlap / maxo) for r in rows]


def _rrf(*lists, k_const: int = 60):
    scores: dict[str, float] = {}
    for lst in lists:
        for rank, (cid, _) in enumerate(lst):
            scores[cid] = scores.get(cid, 0.0) + 1.0 / (k_const + rank + 1)
    return sorted(scores.items(), key=lambda kv: -kv[1])


def _hydrate(conn, ranked, k):
    out = []
    for cid, score in ranked[:k]:
        r = conn.execute(
            text("SELECT c.id chunk_id, c.revision_id, rev.item_id, c.heading_path, c.body "
                 "FROM kb_chunk c JOIN kb_revision rev ON rev.id=c.revision_id WHERE c.id=:id"),
            {"id": cid},
        ).first()
        if r:
            out.append({"chunk_id": str(r.chunk_id), "revision_id": str(r.revision_id), "item_id": str(r.item_id),
                        "heading_path": r.heading_path, "body": r.body, "score": round(float(score), 4)})
    return out


def retrieve(project_id: str, release_key: str, query: str, k: int = 4, mode: str = "vector") -> list[dict[str, Any]]:
    with get_engine().connect() as conn:
        revs = _release_revs(conn, project_id, release_key)
        if not revs:
            return []
        n = max(k * 3, 10)
        if mode == "vector":
            ranked = _cand_vector(conn, revs, query, n)
        elif mode == "lexical":
            ranked = _cand_lexical(conn, revs, query, n)
        elif mode == "hybrid":
            ranked = _rrf(_cand_vector(conn, revs, query, n), _cand_lexical(conn, revs, query, n))
        elif mode == "graph":
            ranked = _cand_graph(conn, revs, query, n)
        elif mode == "graph_hybrid":
            ranked = _rrf(_cand_vector(conn, revs, query, n), _cand_graph(conn, revs, query, n))
        else:
            raise ValueError(f"unknown retrieval mode '{mode}'")
        return _hydrate(conn, ranked, k)
