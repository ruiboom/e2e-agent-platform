// Specify endpoint (scripts / M1 verify). Same core as the UI server action.
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { runSpecify } from "@/lib/specify";

export async function POST(req: Request) {
  const session = await getSession();
  const body = await req.json().catch(() => ({}));
  try {
    const result = await runSpecify(session, body.projectId ?? body.project_id, body.topic ?? "");
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
