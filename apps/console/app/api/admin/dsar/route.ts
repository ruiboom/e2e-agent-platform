// DSAR — data subject access (GET export) + erasure (POST). Gated by data:admin; audited.
import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth";
import { eraseSubject, exportSubject } from "@/lib/data-rights";
import { can } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!can(session.role, "data:admin")) return NextResponse.json({ error: "forbidden: data:admin" }, { status: 403 });
  const userId = req.nextUrl.searchParams.get("user_id") ?? "";
  if (!userId) return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  return NextResponse.json(await exportSubject(userId));
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!can(session.role, "data:admin")) return NextResponse.json({ error: "forbidden: data:admin" }, { status: 403 });
  const { user_id } = await req.json().catch(() => ({}));
  if (!user_id) return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  return NextResponse.json({ erased: await eraseSubject(user_id, session.userId) });
}
