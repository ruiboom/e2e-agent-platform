// Verify the tamper-evident audit chain (H1). Read-only; an audit/assurance
// function — available to any authenticated user.
import { NextResponse } from "next/server";

import { verifyAuditChain } from "@agent-platform/lineage-client";

import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const result = await verifyAuditChain(pool());
  return NextResponse.json(result);
}
