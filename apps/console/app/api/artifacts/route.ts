// Artifact edit endpoint. Artifacts are immutable, so "editing" appends a new
// version of the same type with the edited payload, parented on the original —
// the golden thread keeps every prior version.
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { lineage } from "@/lib/lineage";
import { can } from "@/lib/rbac";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!can(session.role, "artifact:write")) {
    return NextResponse.json({ error: "forbidden: artifact:write" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { artifactId?: string; payload?: unknown };
  const { artifactId, payload } = body;
  if (!artifactId || typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return NextResponse.json({ error: "artifactId and an object payload are required" }, { status: 400 });
  }

  const prior = await lineage().getArtifact(artifactId);
  if (!prior) return NextResponse.json({ error: `artifact ${artifactId} not found` }, { status: 404 });

  try {
    const art = await lineage().createArtifact({
      project_id: prior.project_id,
      type: prior.type,
      payload: payload as Record<string, unknown>,
      created_by: session.userId,
      parents: [prior.id],
    });
    return NextResponse.json({ id: art.id, type: art.type, version: art.version });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
