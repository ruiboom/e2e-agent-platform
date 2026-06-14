// Shared lineage contract — TypeScript side.
// The Python client in py/lineage runs the equivalent sequence; both must agree
// on versioning, parent linking, status transitions and diffs.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { LineageClient } from "../src/index.ts";

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5433/agent_platform";
const pool = new pg.Pool({ connectionString });
const lineage = new LineageClient(pool);

const slug = `ct-ts-${Date.now()}`;
let projectId = "";

after(async () => {
  if (projectId) {
    await pool.query(
      `DELETE FROM artifact_parent WHERE child_id IN (SELECT id FROM artifact WHERE project_id=$1)`,
      [projectId],
    );
    await pool.query(`DELETE FROM artifact WHERE project_id=$1`, [projectId]);
    await pool.query(`DELETE FROM project WHERE id=$1`, [projectId]);
  }
  await pool.end();
});

test("create project persists", async () => {
  const p = await lineage.createProject({ slug, name: "Contract Test", owner: "tester", domain: "test" });
  projectId = p.id;
  assert.equal(p.slug, slug);
  const fetched = await lineage.getProject(slug);
  assert.equal(fetched?.id, p.id);
});

test("immutable append: versions increment per (project,type)", async () => {
  const scopeV1 = await lineage.createArtifact({
    project_id: projectId, type: "scope", payload: { outline: ["a"] }, created_by: "tester", parents: [],
  });
  assert.equal(scopeV1.version, 1);

  const sysPrompt = await lineage.createArtifact({
    project_id: projectId, type: "system_prompt", payload: { text: "be helpful" },
    created_by: "tester", parents: [scopeV1.id],
  });
  assert.equal(sysPrompt.version, 1);
  assert.deepEqual(sysPrompt.parents, [scopeV1.id]);

  const scopeV2 = await lineage.createArtifact({
    project_id: projectId, type: "scope", payload: { outline: ["a", "b"] },
    created_by: "tester", parents: [scopeV1.id],
  });
  assert.equal(scopeV2.version, 2, "second scope is v2");
});

test("getLineage returns nodes + edges", async () => {
  const g = await lineage.getLineage(projectId);
  assert.equal(g.nodes.length, 3);
  // system_prompt(parent scope v1) + scope v2 (parent scope v1) = 2 edges
  assert.equal(g.edges.length, 2);
});

test("approveArtifact supersedes the prior approved of same type", async () => {
  const g = await lineage.getLineage(projectId);
  const scopes = g.nodes.filter((n) => n.type === "scope").sort((a, b) => a.version - b.version);
  const [v1, v2] = scopes;
  const a1 = await lineage.approveArtifact(v1!.id);
  assert.equal(a1.status, "approved");
  const a2 = await lineage.approveArtifact(v2!.id);
  assert.equal(a2.status, "approved");
  const reloadV1 = await lineage.getArtifact(v1!.id);
  assert.equal(reloadV1?.status, "superseded", "approving v2 supersedes v1");
});

test("diffArtifacts reports payload changes", async () => {
  const g = await lineage.getLineage(projectId);
  const scopes = g.nodes.filter((n) => n.type === "scope").sort((a, b) => a.version - b.version);
  const diff = await lineage.diffArtifacts(scopes[0]!.id, scopes[1]!.id);
  assert.ok("outline" in diff.changed, "outline changed between v1 and v2");
});

test("createArtifact rejects a missing parents field", async () => {
  await assert.rejects(
    // @ts-expect-error intentionally omitting `parents`
    () => lineage.createArtifact({ project_id: projectId, type: "scope", created_by: "tester" }),
  );
});
