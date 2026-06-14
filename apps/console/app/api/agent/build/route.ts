// Build an agent_version from the project's latest system_prompt + kb_release.
// Proxies the build-runtime (which emits the agent_version lineage artifact).
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { lineage } from "@/lib/lineage";
import { can } from "@/lib/rbac";

const RUNTIME = (process.env.BUILD_RUNTIME_URL || "http://localhost:8791").replace(/\/$/, "");

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!can(session.role, "artifact:write")) {
    return NextResponse.json({ error: "forbidden: artifact:write" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { projectId?: string; paradigm?: string };
  const projectId = body.projectId;
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const graph = await lineage().getLineage(projectId);
  const latest = (type: string) =>
    graph.nodes.filter((n) => n.type === type).sort((a, b) => b.version - a.version)[0];
  const sp = latest("system_prompt");
  const kbr = latest("kb_release");
  if (!sp || !kbr) {
    return NextResponse.json(
      { error: "project needs a system_prompt (Specify) and a kb_release (Ground) first" },
      { status: 400 },
    );
  }
  // Retrieval strategy + paradigm come from the ADR when present (Phase 2/3),
  // or an explicit paradigm in the request body (Phase 4 build breadth).
  const adr = latest("adr");
  const retrieval_strategy = (adr?.payload.retrievalStrategy as string) ?? "vector";
  const paradigm = body.paradigm ?? (adr?.payload.buildParadigm as string) ?? "code";

  const res = await fetch(`${RUNTIME}/v1/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: projectId,
      paradigm,
      system_prompt_artifact_id: sp.id,
      kb_release_artifact_id: kbr.id,
      retrieval_strategy,
    }),
  });
  const data = await res.json().catch(() => ({ error: "non-JSON from build-runtime" }));
  return NextResponse.json(data, { status: res.status });
}
