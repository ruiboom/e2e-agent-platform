"""Artifact + project lineage client (Python).

Contract is IDENTICAL (shapes + semantics + invariants) to the TypeScript client
in ``packages/lineage-client``. Method names are idiomatic per language
(snake_case here, camelCase there); behaviour is verified by a shared contract
test.

Invariants (also enforced at the DB level):
  - Immutable append: a new fact is a new artifact row with version = max+1 for
    (project_id, type). ``payload`` is never UPDATEd.
  - The only mutation is a status transition (draft -> approved -> superseded).
  - ``parents`` is required at write time (may be [] for a genesis artifact).
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine


@dataclass
class Project:
    id: str
    slug: str
    name: str
    domain: str | None
    owner: str
    status: str
    created_at: datetime


@dataclass
class Artifact:
    id: str
    project_id: str
    type: str
    version: int
    status: str
    payload: dict[str, Any]
    created_by: str
    created_at: datetime
    parents: list[str] = field(default_factory=list)


@dataclass
class LineageEdge:
    child_id: str
    parent_id: str


@dataclass
class LineageGraph:
    nodes: list[Artifact]
    edges: list[LineageEdge]


@dataclass
class ArtifactDiff:
    a: dict[str, Any]
    b: dict[str, Any]
    added: dict[str, Any]
    removed: dict[str, Any]
    changed: dict[str, dict[str, Any]]


def _normalize_url(url: str) -> str:
    # SQLAlchemy needs the driver in the scheme; psycopg3 is `+psycopg`.
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


def _project(row: Any) -> Project:
    return Project(
        id=str(row["id"]), slug=row["slug"], name=row["name"], domain=row["domain"],
        owner=row["owner"], status=row["status"], created_at=row["created_at"],
    )


def _artifact(row: Any, parents: list[str] | None = None) -> Artifact:
    return Artifact(
        id=str(row["id"]), project_id=str(row["project_id"]), type=row["type"],
        version=row["version"], status=row["status"], payload=row["payload"],
        created_by=row["created_by"], created_at=row["created_at"],
        parents=parents or [],
    )


class LineageClient:
    def __init__(self, engine: Engine):
        self.engine = engine

    @classmethod
    def from_database_url(cls, url: str | None = None) -> "LineageClient":
        url = url or os.environ.get(
            "DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/agent_platform"
        )
        return cls(create_engine(_normalize_url(url)))

    # ── Projects ────────────────────────────────────────────────────────
    def create_project(self, *, slug: str, name: str, owner: str, domain: str | None = None) -> Project:
        with self.engine.begin() as conn:
            row = conn.execute(
                text(
                    "INSERT INTO project (slug, name, domain, owner) "
                    "VALUES (:slug, :name, :domain, :owner) RETURNING *"
                ),
                {"slug": slug, "name": name, "domain": domain, "owner": owner},
            ).mappings().one()
            return _project(row)

    def get_project(self, id_or_slug: str) -> Project | None:
        with self.engine.connect() as conn:
            row = conn.execute(
                text("SELECT * FROM project WHERE id::text = :v OR slug = :v LIMIT 1"),
                {"v": id_or_slug},
            ).mappings().first()
            return _project(row) if row else None

    def list_projects(self) -> list[Project]:
        with self.engine.connect() as conn:
            rows = conn.execute(text("SELECT * FROM project ORDER BY created_at DESC")).mappings().all()
            return [_project(r) for r in rows]

    # ── Artifacts ───────────────────────────────────────────────────────
    def create_artifact(
        self, *, project_id: str, type: str, created_by: str, parents: list[str],
        payload: dict[str, Any] | None = None,
    ) -> Artifact:
        if parents is None or not isinstance(parents, list):
            raise ValueError("create_artifact: `parents` is required (use [] for a genesis artifact)")
        with self.engine.begin() as conn:
            version = conn.execute(
                text(
                    "SELECT COALESCE(MAX(version),0)+1 AS next FROM artifact "
                    "WHERE project_id = :pid AND type = :type"
                ),
                {"pid": project_id, "type": type},
            ).scalar_one()
            row = conn.execute(
                text(
                    "INSERT INTO artifact (project_id, type, version, payload, created_by) "
                    "VALUES (:pid, :type, :version, CAST(:payload AS jsonb), :created_by) RETURNING *"
                ),
                {
                    "pid": project_id, "type": type, "version": version,
                    "payload": json.dumps(payload or {}), "created_by": created_by,
                },
            ).mappings().one()
            for parent_id in parents:
                conn.execute(
                    text("INSERT INTO artifact_parent (child_id, parent_id) VALUES (:c, :p)"),
                    {"c": row["id"], "p": parent_id},
                )
            return _artifact(row, list(parents))

    def get_artifact(self, artifact_id: str) -> Artifact | None:
        with self.engine.connect() as conn:
            row = conn.execute(
                text("SELECT * FROM artifact WHERE id = :id"), {"id": artifact_id}
            ).mappings().first()
            if not row:
                return None
            parents = [
                str(r["parent_id"])
                for r in conn.execute(
                    text("SELECT parent_id FROM artifact_parent WHERE child_id = :id"),
                    {"id": artifact_id},
                ).mappings().all()
            ]
            return _artifact(row, parents)

    def approve_artifact(self, artifact_id: str) -> Artifact:
        with self.engine.begin() as conn:
            target = conn.execute(
                text("SELECT project_id, type FROM artifact WHERE id = :id FOR UPDATE"),
                {"id": artifact_id},
            ).mappings().first()
            if not target:
                raise ValueError(f"approve_artifact: artifact {artifact_id} not found")
            conn.execute(
                text(
                    "UPDATE artifact SET status='superseded' "
                    "WHERE project_id=:pid AND type=:type AND status='approved' AND id<>:id"
                ),
                {"pid": target["project_id"], "type": target["type"], "id": artifact_id},
            )
            row = conn.execute(
                text("UPDATE artifact SET status='approved' WHERE id=:id RETURNING *"),
                {"id": artifact_id},
            ).mappings().one()
            return _artifact(row)

    # ── Lineage ─────────────────────────────────────────────────────────
    def get_lineage(self, project_id: str) -> LineageGraph:
        with self.engine.connect() as conn:
            nodes = conn.execute(
                text("SELECT * FROM artifact WHERE project_id = :pid ORDER BY created_at"),
                {"pid": project_id},
            ).mappings().all()
            edges = conn.execute(
                text(
                    "SELECT ap.child_id, ap.parent_id FROM artifact_parent ap "
                    "JOIN artifact a ON a.id = ap.child_id WHERE a.project_id = :pid"
                ),
                {"pid": project_id},
            ).mappings().all()
        by_child: dict[str, list[str]] = {}
        for e in edges:
            by_child.setdefault(str(e["child_id"]), []).append(str(e["parent_id"]))
        return LineageGraph(
            nodes=[_artifact(n, by_child.get(str(n["id"]), [])) for n in nodes],
            edges=[LineageEdge(child_id=str(e["child_id"]), parent_id=str(e["parent_id"])) for e in edges],
        )

    def diff_artifacts(self, a_id: str, b_id: str) -> ArtifactDiff:
        a = self.get_artifact(a_id)
        b = self.get_artifact(b_id)
        if a is None:
            raise ValueError(f"diff_artifacts: artifact {a_id} not found")
        if b is None:
            raise ValueError(f"diff_artifacts: artifact {b_id} not found")
        added: dict[str, Any] = {}
        removed: dict[str, Any] = {}
        changed: dict[str, dict[str, Any]] = {}
        for k in set(a.payload) | set(b.payload):
            in_a, in_b = k in a.payload, k in b.payload
            if in_a and not in_b:
                removed[k] = a.payload[k]
            elif in_b and not in_a:
                added[k] = b.payload[k]
            elif a.payload[k] != b.payload[k]:
                changed[k] = {"from": a.payload[k], "to": b.payload[k]}
        return ArtifactDiff(
            a={"id": a.id, "type": a.type, "version": a.version},
            b={"id": b.id, "type": b.type, "version": b.version},
            added=added, removed=removed, changed=changed,
        )
