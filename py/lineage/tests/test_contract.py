"""Shared lineage contract — Python side.

Mirrors packages/lineage-client/test/contract.test.ts. Both clients must agree
on versioning, parent linking, status transitions and diffs.
"""
import os
import time

import pytest
from sqlalchemy import text

from lineage import LineageClient

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/agent_platform"
)


@pytest.fixture(scope="module")
def lineage():
    client = LineageClient.from_database_url(DATABASE_URL)
    yield client
    client.engine.dispose()


@pytest.fixture(scope="module")
def project(lineage):
    p = lineage.create_project(
        slug=f"ct-py-{int(time.time() * 1000)}", name="Contract Test", owner="tester", domain="test"
    )
    yield p
    with lineage.engine.begin() as conn:
        conn.execute(
            text(
                "DELETE FROM artifact_parent WHERE child_id IN "
                "(SELECT id FROM artifact WHERE project_id = :pid)"
            ),
            {"pid": p.id},
        )
        conn.execute(text("DELETE FROM artifact WHERE project_id = :pid"), {"pid": p.id})
        conn.execute(text("DELETE FROM project WHERE id = :pid"), {"pid": p.id})


def test_create_project_persists(lineage, project):
    fetched = lineage.get_project(project.slug)
    assert fetched is not None
    assert fetched.id == project.id


def test_immutable_append_versions_increment(lineage, project):
    scope_v1 = lineage.create_artifact(
        project_id=project.id, type="scope", payload={"outline": ["a"]}, created_by="tester", parents=[]
    )
    assert scope_v1.version == 1

    sys_prompt = lineage.create_artifact(
        project_id=project.id, type="system_prompt", payload={"text": "be helpful"},
        created_by="tester", parents=[scope_v1.id],
    )
    assert sys_prompt.version == 1
    assert sys_prompt.parents == [scope_v1.id]

    scope_v2 = lineage.create_artifact(
        project_id=project.id, type="scope", payload={"outline": ["a", "b"]},
        created_by="tester", parents=[scope_v1.id],
    )
    assert scope_v2.version == 2


def test_get_lineage_nodes_and_edges(lineage, project):
    g = lineage.get_lineage(project.id)
    assert len(g.nodes) == 3
    assert len(g.edges) == 2


def test_approve_supersedes_prior(lineage, project):
    g = lineage.get_lineage(project.id)
    scopes = sorted([n for n in g.nodes if n.type == "scope"], key=lambda n: n.version)
    lineage.approve_artifact(scopes[0].id)
    lineage.approve_artifact(scopes[1].id)
    reloaded_v1 = lineage.get_artifact(scopes[0].id)
    assert reloaded_v1.status == "superseded"


def test_diff_reports_changes(lineage, project):
    g = lineage.get_lineage(project.id)
    scopes = sorted([n for n in g.nodes if n.type == "scope"], key=lambda n: n.version)
    diff = lineage.diff_artifacts(scopes[0].id, scopes[1].id)
    assert "outline" in diff.changed
