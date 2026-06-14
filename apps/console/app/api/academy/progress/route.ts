import { NextResponse, type NextRequest } from "next/server";

import { getProgress, markComplete, pathComplete } from "@/lib/academy";
import { getSession } from "@/lib/auth";
import { ROLE_PATHS } from "@/lib/enablement";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!ROLE_PATHS[path]) return NextResponse.json({ error: "unknown path" }, { status: 400 });
  const done = await getProgress(session.userId, path);
  return NextResponse.json({ path, done, complete: pathComplete(path, done) });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { path, stageId } = await req.json().catch(() => ({}));
  const rp = ROLE_PATHS[path];
  if (!rp) return NextResponse.json({ error: "unknown path" }, { status: 400 });
  if (!rp.stages.includes(stageId)) {
    return NextResponse.json({ error: `stage '${stageId}' not in path '${path}'` }, { status: 400 });
  }
  await markComplete(session.userId, path, stageId);
  const done = await getProgress(session.userId, path);
  return NextResponse.json({ path, done, complete: pathComplete(path, done) });
}
