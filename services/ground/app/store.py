"""Canonical store operations: ingest, release, retrieve."""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text

from lineage import LineageClient
from providers import embed, to_pgvector

from app.chunk import chunk_markdown
from app.db import get_engine

_lineage: LineageClient | None = None


def _lin() -> LineageClient:
    global _lineage
    if _lineage is None:
        _lineage = LineageClient.from_database_url()
    return _lineage


def _sha(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def ingest(project_id: str, docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Ingest docs [{uri,title,body}] -> items/revisions/chunks(+embeddings)."""
    results: list[dict[str, Any]] = []
    with get_engine().begin() as conn:
        for doc in docs:
            uri = doc["uri"]
            body = doc["body"]
            chash = _sha(body)

            item_id = conn.execute(
                text("SELECT id FROM kb_item WHERE project_id = :p AND uri = :u"),
                {"p": project_id, "u": uri},
            ).scalar()
            if item_id is None:
                item_id = conn.execute(
                    text("INSERT INTO kb_item (project_id, uri, title) VALUES (:p,:u,:t) RETURNING id"),
                    {"p": project_id, "u": uri, "t": doc.get("title")},
                ).scalar_one()

            # Skip if the latest revision already has this content.
            latest = conn.execute(
                text("SELECT id, content_hash FROM kb_revision WHERE item_id=:i ORDER BY rev_number DESC LIMIT 1"),
                {"i": item_id},
            ).first()
            if latest and latest.content_hash == chash:
                results.append({"item_id": str(item_id), "revision_id": str(latest.id), "chunks": 0, "unchanged": True})
                continue

            rev_n = conn.execute(
                text("SELECT COALESCE(MAX(rev_number),0)+1 FROM kb_revision WHERE item_id=:i"),
                {"i": item_id},
            ).scalar_one()
            rev_id = conn.execute(
                text(
                    "INSERT INTO kb_revision (item_id, rev_number, body, content_hash) "
                    "VALUES (:i,:n,:b,:h) RETURNING id"
                ),
                {"i": item_id, "n": rev_n, "b": body, "h": chash},
            ).scalar_one()

            chunks = chunk_markdown(body)
            vectors = embed([c[1] for c in chunks]) if chunks else []
            for idx, ((heading, ctext), vec) in enumerate(zip(chunks, vectors)):
                conn.execute(
                    text(
                        "INSERT INTO kb_chunk (revision_id, chunk_index, heading_path, body, embedding) "
                        "VALUES (:r,:idx,:h,:b, CAST(:e AS vector))"
                    ),
                    {"r": rev_id, "idx": idx, "h": heading, "b": ctext, "e": to_pgvector(vec)},
                )
            results.append({"item_id": str(item_id), "revision_id": str(rev_id), "chunks": len(chunks)})
    return results


def create_release(project_id: str, kb_outline_artifact_id: str | None) -> dict[str, Any]:
    """Snapshot latest revisions into a kb_release row + emit a kb_release artifact."""
    with get_engine().begin() as conn:
        rows = conn.execute(
            text(
                "SELECT i.id AS item_id, r.id AS revision_id FROM kb_item i "
                "JOIN LATERAL (SELECT id FROM kb_revision WHERE item_id=i.id ORDER BY rev_number DESC LIMIT 1) r "
                "ON true WHERE i.project_id = :p"
            ),
            {"p": project_id},
        ).all()
        item_revisions = [{"item_id": str(x.item_id), "revision_id": str(x.revision_id)} for x in rows]
        content_hash = _sha("|".join(sorted(ir["revision_id"] for ir in item_revisions)))

        n = conn.execute(
            text("SELECT COUNT(*) FROM kb_release WHERE project_id=:p"), {"p": project_id}
        ).scalar_one()
        release_key = f"kb-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{n + 1}"

        conn.execute(
            text(
                "INSERT INTO kb_release (project_id, release_key, item_revisions, content_hash) "
                "VALUES (:p,:k, CAST(:ir AS jsonb), :h)"
            ),
            {"p": project_id, "k": release_key, "ir": _json(item_revisions), "h": content_hash},
        )

    artifact = _lin().create_artifact(
        project_id=project_id,
        type="kb_release",
        payload={
            "release_key": release_key,
            "item_revisions": item_revisions,
            "content_hash": content_hash,
            "retrieval_indexes": ["pgvector"],
        },
        created_by="ground",
        parents=[kb_outline_artifact_id] if kb_outline_artifact_id else [],
    )
    return {
        "release_key": release_key,
        "kb_release_artifact_id": artifact.id,
        "item_count": len(item_revisions),
        "content_hash": content_hash,
    }


def retrieve(project_id: str, release_key: str, query: str, k: int = 4) -> list[dict[str, Any]]:
    """Vector search over the chunks pinned by a release; returns provenance per chunk."""
    qv = to_pgvector(embed([query])[0])
    with get_engine().connect() as conn:
        rel = conn.execute(
            text("SELECT item_revisions FROM kb_release WHERE project_id=:p AND release_key=:k"),
            {"p": project_id, "k": release_key},
        ).first()
        if not rel:
            return []
        revision_ids = [ir["revision_id"] for ir in rel.item_revisions]
        if not revision_ids:
            return []
        rows = conn.execute(
            text(
                "SELECT c.id AS chunk_id, c.revision_id, r.item_id, c.heading_path, c.body, "
                "       1 - (c.embedding <=> CAST(:qv AS vector)) AS score "
                "FROM kb_chunk c JOIN kb_revision r ON r.id = c.revision_id "
                "WHERE c.revision_id::text = ANY(:revs) "
                "ORDER BY c.embedding <=> CAST(:qv AS vector) LIMIT :k"
            ),
            {"qv": qv, "revs": revision_ids, "k": k},
        ).all()
        return [
            {
                "chunk_id": str(x.chunk_id),
                "revision_id": str(x.revision_id),
                "item_id": str(x.item_id),
                "heading_path": x.heading_path,
                "body": x.body,
                "score": float(x.score),
            }
            for x in rows
        ]


def _json(obj: Any) -> str:
    import json

    return json.dumps(obj)
