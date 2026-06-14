// Shared Postgres pool for non-lineage tables (academy progress, ...).
import "server-only";
import pg from "pg";

const g = globalThis as unknown as { __ap_pool?: pg.Pool };

export function pool(): pg.Pool {
  if (!g.__ap_pool) {
    g.__ap_pool = new pg.Pool({
      connectionString:
        process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5433/agent_platform",
    });
  }
  return g.__ap_pool;
}
