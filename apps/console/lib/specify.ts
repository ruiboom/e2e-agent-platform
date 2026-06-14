// Specify core: one model-router call -> scope + system_prompt + kb_outline,
// emitted as three linked lineage artifacts. Shared by the server action (UI)
// and the /api/specify route handler (scripts / M1 verify).
import "server-only";

import { ModelRouterClient } from "@agent-platform/model-router-client";

import { lineage } from "@/lib/lineage";
import { can } from "@/lib/rbac";
import type { Session } from "@/lib/session";

function parseSpec(text: string): { scope: Record<string, unknown>; system_prompt: string; kb_outline: Record<string, unknown> } {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1]!.trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  const obj = JSON.parse(s);
  return {
    scope: obj.scope ?? { outline: [] },
    system_prompt: String(obj.system_prompt ?? ""),
    kb_outline: obj.kb_outline ?? { topics: [] },
  };
}

export interface SpecifyResult {
  scopeId: string;
  systemPromptId: string;
  kbOutlineId: string;
}

export async function runSpecify(
  session: Session | null,
  projectId: string,
  topic: string,
): Promise<SpecifyResult> {
  if (!session || !can(session.role, "artifact:write")) {
    const err = new Error("forbidden: artifact:write") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  if (!projectId || !topic.trim()) throw new Error("projectId and topic are required");

  const router = new ModelRouterClient();
  const res = await router.route({ prompt_key: "specify.spec", vars: { topic }, project_id: projectId });
  const spec = parseSpec(res.text);

  // Link scope to a signed-off proposition if one exists (Phase 2 chain);
  // otherwise scope is a genesis artifact (Phase 1 standalone slice).
  const graph = await lineage().getLineage(projectId);
  const proposition = graph.nodes
    .filter((n) => n.type === "proposition" && n.payload.status === "signed_off")
    .sort((a, b) => b.version - a.version)[0];

  const scope = await lineage().createArtifact({
    project_id: projectId,
    type: "scope",
    payload: { topic, ...spec.scope },
    created_by: session.userId,
    parents: proposition ? [proposition.id] : [],
  });
  const systemPrompt = await lineage().createArtifact({
    project_id: projectId,
    type: "system_prompt",
    payload: { text: spec.system_prompt },
    created_by: session.userId,
    parents: [scope.id],
  });
  const kbOutline = await lineage().createArtifact({
    project_id: projectId,
    type: "kb_outline",
    payload: spec.kb_outline,
    created_by: session.userId,
    parents: [scope.id],
  });

  return { scopeId: scope.id, systemPromptId: systemPrompt.id, kbOutlineId: kbOutline.id };
}
