// Hash-chained audit log (H1) — TS side. The digest MUST be byte-identical to
// py/lineage/lineage/audit.py so a mixed sequence of writes forms one valid chain.
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

const US = "\x1f";
const LOCK_KEY = 920706;
export const GENESIS = "GENESIS";

export function auditDigest(
  prev: string,
  actor: string,
  action: string,
  targetType: string | null | undefined,
  targetId: string | null | undefined,
  meta: string | null | undefined,
): string {
  const s = [prev, actor ?? "", action ?? "", targetType ?? "", targetId ?? "", meta ?? ""].join(US);
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export interface AuditInput {
  actor: string;
  action: string;
  projectId?: string | null;
  actorKind?: string;
  targetType?: string | null;
  targetId?: string | null;
  meta?: string;
  payload?: Record<string, unknown>;
}

export async function appendAudit(client: PoolClient, opts: AuditInput): Promise<string> {
  await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
  const { rows } = await client.query<{ hash: string }>(
    "SELECT hash FROM audit_event ORDER BY id DESC LIMIT 1",
  );
  const prev = rows[0]?.hash ?? GENESIS;
  const h = auditDigest(prev, opts.actor, opts.action, opts.targetType, opts.targetId, opts.meta);
  await client.query(
    `INSERT INTO audit_event
       (project_id, actor, actor_kind, action, target_type, target_id, meta, payload, prev_hash, hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
    [
      opts.projectId ?? null, opts.actor, opts.actorKind ?? "user", opts.action,
      opts.targetType ?? null, opts.targetId ?? null, opts.meta ?? "",
      JSON.stringify(opts.payload ?? {}), prev, h,
    ],
  );
  return h;
}

export interface ChainResult {
  ok: boolean;
  count: number;
  broken_at?: number;
  id?: number;
  reason?: string;
}

export async function verifyAuditChain(pool: Pool): Promise<ChainResult> {
  const { rows } = await pool.query(
    "SELECT id, actor, action, target_type, target_id, meta, prev_hash, hash FROM audit_event ORDER BY id",
  );
  let prev = GENESIS;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.prev_hash !== prev) {
      return { ok: false, count: rows.length, broken_at: i, id: r.id, reason: "prev_hash linkage broken" };
    }
    if (auditDigest(prev, r.actor, r.action, r.target_type, r.target_id, r.meta) !== r.hash) {
      return { ok: false, count: rows.length, broken_at: i, id: r.id, reason: "content hash mismatch" };
    }
    prev = r.hash;
  }
  return { ok: true, count: rows.length };
}
