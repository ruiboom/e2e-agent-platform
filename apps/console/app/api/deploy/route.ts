// Emit a deployment lineage artifact (child of an agent_version).
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
  const { agentVersionId } = await req.json().catch(() => ({}));
  if (!agentVersionId) return NextResponse.json({ error: "agentVersionId is required" }, { status: 400 });

  const av = await lineage().getArtifact(agentVersionId);
  if (!av || av.type !== "agent_version") {
    return NextResponse.json({ error: "not an agent_version artifact" }, { status: 400 });
  }

  const deployment = await lineage().createArtifact({
    project_id: av.project_id,
    type: "deployment",
    payload: {
      agent_version_id: agentVersionId,
      agent_version: av.version,
      target: "local",
      channels: ["web"],
      provenance: true,
      status: "live",
    },
    created_by: session.userId,
    parents: [agentVersionId],
  });
  return NextResponse.json(deployment, { status: 201 });
}
