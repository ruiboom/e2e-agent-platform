// Retention purge of chat logs. Gated by data:admin; audited.
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { purgeChatLogs } from "@/lib/data-rights";
import { can } from "@/lib/rbac";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!can(session.role, "data:admin")) {
    return NextResponse.json({ error: "forbidden: data:admin" }, { status: 403 });
  }
  const { days } = await req.json().catch(() => ({}));
  const n = Number(days);
  if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: "days must be a non-negative number" }, { status: 400 });
  return NextResponse.json(await purgeChatLogs(n, session.userId));
}
