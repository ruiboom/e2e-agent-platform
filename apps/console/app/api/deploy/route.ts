// Emit a deployment lineage artifact (child of an agent_version).
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { lineage } from "@/lib/lineage";
import { can } from "@/lib/rbac";

const EVAL_URL = (process.env.EVAL_URL || "http://localhost:8792").replace(/\/$/, "");

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!can(session.role, "artifact:write")) {
    return NextResponse.json({ error: "forbidden: artifact:write" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    agentVersionId?: string;
    target?: string;
    channels?: string[];
  };
  const agentVersionId = body.agentVersionId;
  const target = body.target ?? "local";
  const channels = body.channels ?? ["web"];
  if (!agentVersionId) return NextResponse.json({ error: "agentVersionId is required" }, { status: 400 });

  const av = await lineage().getArtifact(agentVersionId);
  if (!av || av.type !== "agent_version") {
    return NextResponse.json({ error: "not an agent_version artifact" }, { status: 400 });
  }

  // Gate 2: an agent may not deploy until its eval passes the project's gates.
  const g2 = await fetch(`${EVAL_URL}/v1/gate2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: av.project_id,
      agent_version_id: agentVersionId,
      context: { target, channels },
    }),
  })
    .then((r) => r.json())
    .catch(() => ({ pass: false, reasons: ["eval service unreachable"] }));
  if (!g2.pass) {
    return NextResponse.json({ error: "blocked by Gate 2", reasons: g2.reasons }, { status: 409 });
  }

  const deployment = await lineage().createArtifact({
    project_id: av.project_id,
    type: "deployment",
    payload: {
      agent_version_id: agentVersionId,
      agent_version: av.version,
      target,
      channels,
      guardrail_policy: { pii: true, injection: true },
      runtime_guards: ["pii", "injection", "escalation"],
      provenance: true,
      status: "live",
    },
    created_by: session.userId,
    parents: [agentVersionId],
  });
  return NextResponse.json(deployment, { status: 201 });
}
