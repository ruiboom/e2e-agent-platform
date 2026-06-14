// Server-side lineage client singleton (reused across hot reloads to avoid
// leaking Postgres connection pools in dev).
import "server-only";

import { LineageClient } from "@agent-platform/lineage-client";

const g = globalThis as unknown as { __ap_lineage?: LineageClient };

export function lineage(): LineageClient {
  if (!g.__ap_lineage) {
    g.__ap_lineage = LineageClient.fromDatabaseUrl(process.env.DATABASE_URL);
  }
  return g.__ap_lineage;
}
