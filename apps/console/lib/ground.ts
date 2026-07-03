// Server-side read of the Ground canonical store for the console UI.
// The ground SERVICE owns writes (ingest/approve/release/enrich); here we only
// read the resulting state so the page can render the KB inventory + release.
import "server-only";

import { pool } from "@/lib/db";

export interface KbScan {
  pii: number;
  injection: number;
}

export interface KbItem {
  itemId: string;
  uri: string;
  title: string | null;
  revisionId: string;
  revNumber: number;
  state: "submitted" | "approved" | "rejected";
  submittedBy: string | null;
  approvedBy: string | null;
  chunks: number;
  scan: KbScan;
  createdAt: string;
  body: string;
}

export interface KbRelease {
  releaseKey: string;
  itemCount: number;
  createdAt: string;
}

export interface GroundState {
  items: KbItem[];
  release: KbRelease | null;
  submittedCount: number;
  approvedCount: number;
}

// Items with their latest revision + its governance state + chunk count.
export async function getGroundState(projectId: string): Promise<GroundState> {
  const { rows } = await pool().query<{
    item_id: string;
    uri: string;
    title: string | null;
    revision_id: string;
    rev_number: number;
    state: KbItem["state"];
    submitted_by: string | null;
    approved_by: string | null;
    chunks: string;
    pii: unknown;
    injection: unknown;
    created_at: string;
    body: string;
  }>(
    `SELECT i.id AS item_id, i.uri, i.title,
            r.id AS revision_id, r.rev_number, r.state, r.submitted_by, r.approved_by,
            r.created_at, r.body,
            (SELECT count(*) FROM kb_chunk c WHERE c.revision_id = r.id) AS chunks,
            r.scan_results->'pii'       AS pii,
            r.scan_results->'injection' AS injection
       FROM kb_item i
       JOIN LATERAL (
         SELECT * FROM kb_revision WHERE item_id = i.id ORDER BY rev_number DESC LIMIT 1
       ) r ON true
      WHERE i.project_id = $1
      ORDER BY i.created_at`,
    [projectId],
  );

  const countFindings = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

  const items: KbItem[] = rows.map((r) => ({
    itemId: r.item_id,
    uri: r.uri,
    title: r.title,
    revisionId: r.revision_id,
    revNumber: r.rev_number,
    state: r.state,
    submittedBy: r.submitted_by,
    approvedBy: r.approved_by,
    chunks: Number(r.chunks),
    scan: { pii: countFindings(r.pii), injection: countFindings(r.injection) },
    createdAt: r.created_at,
    body: r.body,
  }));

  const { rows: rel } = await pool().query<{
    release_key: string;
    item_revisions: { item_id: string; revision_id: string }[];
    created_at: string;
  }>(
    `SELECT release_key, item_revisions, created_at
       FROM kb_release WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [projectId],
  );

  const release: KbRelease | null = rel[0]
    ? {
        releaseKey: rel[0].release_key,
        itemCount: Array.isArray(rel[0].item_revisions) ? rel[0].item_revisions.length : 0,
        createdAt: rel[0].created_at,
      }
    : null;

  return {
    items,
    release,
    submittedCount: items.filter((i) => i.state === "submitted").length,
    approvedCount: items.filter((i) => i.state === "approved").length,
  };
}
