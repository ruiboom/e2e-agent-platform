// Artifact + project lineage client (TypeScript).
//
// Contract is IDENTICAL (shapes + semantics + invariants) to the Python client
// in `py/lineage`. Method names are idiomatic per language (camelCase here,
// snake_case there); the behaviour is verified by a shared contract test.
//
// Invariants (also enforced at the DB level):
//   - Immutable append: a new fact is a new artifact row with version = max+1
//     for (project_id, type). `payload` is never UPDATEd.
//   - The only mutation is a status transition (draft -> approved -> superseded).
//   - `parents` is required at write time (may be [] for a genesis artifact).
import pg from "pg";

import { appendAudit } from "./audit.ts";

export { appendAudit, verifyAuditChain, auditDigest } from "./audit.ts";
export type { ChainResult, AuditInput } from "./audit.ts";

export type ArtifactStatus = "draft" | "approved" | "superseded";

export interface Project {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
  owner: string;
  status: string;
  created_at: string;
}

export interface Artifact {
  id: string;
  project_id: string;
  type: string;
  version: number;
  status: ArtifactStatus;
  payload: Record<string, unknown>;
  created_by: string;
  created_at: string;
  parents: string[];
}

export interface LineageEdge {
  child_id: string;
  parent_id: string;
}

export interface LineageGraph {
  nodes: Artifact[];
  edges: LineageEdge[];
}

export interface ArtifactDiff {
  a: { id: string; type: string; version: number };
  b: { id: string; type: string; version: number };
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
  changed: Record<string, { from: unknown; to: unknown }>;
}

export interface CreateProjectInput {
  slug: string;
  name: string;
  owner: string;
  domain?: string | null;
}

export interface CreateArtifactInput {
  project_id: string;
  type: string;
  payload?: Record<string, unknown>;
  created_by: string;
  parents: string[];
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class LineageClient {
  private pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  static fromDatabaseUrl(url?: string): LineageClient {
    const connectionString =
      url ||
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5433/agent_platform";
    return new LineageClient(new pg.Pool({ connectionString }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // ── Projects ──────────────────────────────────────────────────────────
  async createProject(input: CreateProjectInput): Promise<Project> {
    const { rows } = await this.pool.query<Project>(
      `INSERT INTO project (slug, name, domain, owner)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.slug, input.name, input.domain ?? null, input.owner],
    );
    return rows[0]!;
  }

  async getProject(idOrSlug: string): Promise<Project | null> {
    const { rows } = await this.pool.query<Project>(
      `SELECT * FROM project WHERE id::text = $1 OR slug = $1 LIMIT 1`,
      [idOrSlug],
    );
    return rows[0] ?? null;
  }

  async listProjects(): Promise<Project[]> {
    const { rows } = await this.pool.query<Project>(
      `SELECT * FROM project ORDER BY created_at DESC`,
    );
    return rows;
  }

  // ── Artifacts ─────────────────────────────────────────────────────────
  async createArtifact(input: CreateArtifactInput): Promise<Artifact> {
    if (!Array.isArray(input.parents)) {
      throw new Error("createArtifact: `parents` is required (use [] for a genesis artifact)");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: vrows } = await client.query<{ next: number }>(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next
           FROM artifact WHERE project_id = $1 AND type = $2`,
        [input.project_id, input.type],
      );
      const version = vrows[0]!.next;
      const { rows } = await client.query<Artifact>(
        `INSERT INTO artifact (project_id, type, version, payload, created_by)
         VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING *`,
        [input.project_id, input.type, version, JSON.stringify(input.payload ?? {}), input.created_by],
      );
      const artifact = rows[0]!;
      for (const parentId of input.parents) {
        await client.query(
          `INSERT INTO artifact_parent (child_id, parent_id) VALUES ($1, $2)`,
          [artifact.id, parentId],
        );
      }
      await appendAudit(client, {
        actor: input.created_by, action: "artifact.create", projectId: input.project_id,
        targetType: "artifact", targetId: artifact.id, meta: `${input.type}:v${version}`,
        payload: { type: input.type, version },
      });
      await client.query("COMMIT");
      return { ...artifact, parents: [...input.parents] };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async getArtifact(id: string): Promise<Artifact | null> {
    const { rows } = await this.pool.query<Artifact>(
      `SELECT * FROM artifact WHERE id = $1`,
      [id],
    );
    if (!rows[0]) return null;
    const { rows: prows } = await this.pool.query<{ parent_id: string }>(
      `SELECT parent_id FROM artifact_parent WHERE child_id = $1`,
      [id],
    );
    return { ...rows[0], parents: prows.map((r) => r.parent_id) };
  }

  // Promote an artifact to `approved`; supersede the prior approved one of the
  // same (project_id, type). One transaction.
  async approveArtifact(id: string): Promise<Artifact> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: trows } = await client.query<{ project_id: string; type: string }>(
        `SELECT project_id, type FROM artifact WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (!trows[0]) throw new Error(`approveArtifact: artifact ${id} not found`);
      await client.query(
        `UPDATE artifact SET status = 'superseded'
          WHERE project_id = $1 AND type = $2 AND status = 'approved' AND id <> $3`,
        [trows[0].project_id, trows[0].type, id],
      );
      const { rows } = await client.query<Artifact>(
        `UPDATE artifact SET status = 'approved' WHERE id = $1 RETURNING *`,
        [id],
      );
      await client.query("COMMIT");
      return rows[0]!;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Lineage ───────────────────────────────────────────────────────────
  async getLineage(projectId: string): Promise<LineageGraph> {
    const { rows: nodes } = await this.pool.query<Artifact>(
      `SELECT * FROM artifact WHERE project_id = $1 ORDER BY created_at`,
      [projectId],
    );
    const { rows: edges } = await this.pool.query<LineageEdge>(
      `SELECT ap.child_id, ap.parent_id
         FROM artifact_parent ap
         JOIN artifact a ON a.id = ap.child_id
        WHERE a.project_id = $1`,
      [projectId],
    );
    const byChild = new Map<string, string[]>();
    for (const e of edges) {
      byChild.set(e.child_id, [...(byChild.get(e.child_id) ?? []), e.parent_id]);
    }
    return {
      nodes: nodes.map((n) => ({ ...n, parents: byChild.get(n.id) ?? [] })),
      edges,
    };
  }

  async diffArtifacts(aId: string, bId: string): Promise<ArtifactDiff> {
    const a = await this.getArtifact(aId);
    const b = await this.getArtifact(bId);
    if (!a) throw new Error(`diffArtifacts: artifact ${aId} not found`);
    if (!b) throw new Error(`diffArtifacts: artifact ${bId} not found`);
    const added: Record<string, unknown> = {};
    const removed: Record<string, unknown> = {};
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    const keys = new Set([...Object.keys(a.payload), ...Object.keys(b.payload)]);
    for (const k of keys) {
      const inA = k in a.payload;
      const inB = k in b.payload;
      if (inA && !inB) removed[k] = a.payload[k];
      else if (!inA && inB) added[k] = b.payload[k];
      else if (!deepEqual(a.payload[k], b.payload[k])) {
        changed[k] = { from: a.payload[k], to: b.payload[k] };
      }
    }
    return {
      a: { id: a.id, type: a.type, version: a.version },
      b: { id: b.id, type: b.type, version: b.version },
      added,
      removed,
      changed,
    };
  }
}
