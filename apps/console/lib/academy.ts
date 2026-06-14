import "server-only";

import { pool } from "./db";
import { ROLE_PATHS } from "./enablement";

export async function getProgress(userId: string, rolePath: string): Promise<string[]> {
  const { rows } = await pool().query<{ stage_id: string }>(
    "SELECT stage_id FROM academy_progress WHERE user_id=$1 AND role_path=$2",
    [userId, rolePath],
  );
  return rows.map((r: { stage_id: string }) => r.stage_id);
}

export async function markComplete(userId: string, rolePath: string, stageId: string): Promise<void> {
  await pool().query(
    "INSERT INTO academy_progress (user_id, role_path, stage_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
    [userId, rolePath, stageId],
  );
}

export function pathComplete(rolePath: string, done: string[]): boolean {
  const p = ROLE_PATHS[rolePath];
  return p ? p.stages.every((s) => done.includes(s)) : false;
}

const SERVICE_URLS: Record<string, string> = {
  router: process.env.MODEL_ROUTER_URL || "http://localhost:8789",
  ground: process.env.GROUND_URL || "http://localhost:8790",
  build: process.env.BUILD_RUNTIME_URL || "http://localhost:8791",
  eval: process.env.EVAL_URL || "http://localhost:8792",
  optimise: process.env.OPTIMISE_URL || "http://localhost:8793",
};

export async function serviceHealth(): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  await Promise.all(
    Object.entries(SERVICE_URLS).map(async ([k, url]) => {
      try {
        const r = await fetch(`${url.replace(/\/$/, "")}/healthz`, {
          cache: "no-store",
          signal: AbortSignal.timeout(2000),
        });
        out[k] = r.ok;
      } catch {
        out[k] = false;
      }
    }),
  );
  return out;
}
