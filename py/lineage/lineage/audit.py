"""Hash-chained audit log (H1).

One global, append-only chain across all writers (Python services + the TS
console). The digest is byte-identical in both languages
(`packages/lineage-client/src/audit.ts`), so a mixed sequence of writes still
forms one valid chain.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy import text

_US = "\x1f"                      # unit separator between hashed fields
_LOCK_KEY = 920706               # advisory-lock key — serialises appends
GENESIS = "GENESIS"


def digest(prev_hash: str, actor: str, action: str,
           target_type: str | None, target_id: str | None, meta: str | None) -> str:
    s = _US.join([prev_hash, actor or "", action or "", target_type or "", target_id or "", meta or ""])
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def append(conn, *, actor: str, action: str, project_id: str | None = None,
           actor_kind: str = "user", target_type: str | None = None,
           target_id: str | None = None, meta: str = "", payload: dict[str, Any] | None = None) -> str:
    """Append one event inside an existing transaction; returns the event hash."""
    conn.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _LOCK_KEY})
    prev = conn.execute(text("SELECT hash FROM audit_event ORDER BY id DESC LIMIT 1")).scalar() or GENESIS
    tid = str(target_id) if target_id is not None else None
    h = digest(prev, actor, action, target_type, tid, meta)
    conn.execute(
        text("INSERT INTO audit_event "
             "(project_id, actor, actor_kind, action, target_type, target_id, meta, payload, prev_hash, hash) "
             "VALUES (:p,:a,:ak,:ac,:tt,:ti,:m, CAST(:pl AS jsonb), :ph, :h)"),
        {"p": project_id, "a": actor, "ak": actor_kind, "ac": action, "tt": target_type,
         "ti": tid, "m": meta, "pl": json.dumps(payload or {}), "ph": prev, "h": h},
    )
    return h


def verify_chain(engine) -> dict[str, Any]:
    """Walk the global chain in order; recompute each hash + check linkage."""
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT id, actor, action, target_type, target_id, meta, prev_hash, hash "
                 "FROM audit_event ORDER BY id")
        ).all()
    prev = GENESIS
    for i, r in enumerate(rows):
        if r.prev_hash != prev:
            return {"ok": False, "count": len(rows), "broken_at": i, "id": r.id, "reason": "prev_hash linkage broken"}
        if digest(prev, r.actor, r.action, r.target_type, r.target_id, r.meta) != r.hash:
            return {"ok": False, "count": len(rows), "broken_at": i, "id": r.id, "reason": "content hash mismatch"}
        prev = r.hash
    return {"ok": True, "count": len(rows)}
