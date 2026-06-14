// Phase 2 "Shape & plan" stages: Discover -> Define -> Architect -> Plan + Gate 1.
// Each emits a lineage artifact; the chain is
//   opportunity -> proposition -> scope -> adr -> plan, with gate1 over (proposition, adr).
import "server-only";

import { ModelRouterClient } from "@agent-platform/model-router-client";
import type { Artifact } from "@agent-platform/lineage-client";

import { getSession } from "@/lib/auth";
import { parseJsonObject } from "@/lib/json";
import { lineage } from "@/lib/lineage";
import { can, type Capability } from "@/lib/rbac";

const BUILD_PARADIGMS = ["langgraph", "adk", "code", "canvas", "generative"];
const RETRIEVAL_STRATEGIES = ["vector", "lexical", "hybrid", "graph", "graph_hybrid"];

function forbidden(cap: Capability): never {
  const err = new Error(`forbidden: ${cap}`) as Error & { status?: number };
  err.status = 403;
  throw err;
}

async function requireCap(cap: Capability) {
  const session = await getSession();
  if (!session || !can(session.role, cap)) forbidden(cap);
  return session;
}

async function latest(projectId: string, type: string): Promise<Artifact | undefined> {
  const g = await lineage().getLineage(projectId);
  return g.nodes.filter((n) => n.type === type).sort((a, b) => b.version - a.version)[0];
}

const router = () => new ModelRouterClient();

export async function runDiscover(projectId: string, problem: string) {
  const session = await requireCap("artifact:write");
  const res = await router().route({ prompt_key: "discover.opportunity", vars: { problem }, project_id: projectId });
  const payload = parseJsonObject(res.text);
  const art = await lineage().createArtifact({
    project_id: projectId, type: "opportunity", payload, created_by: session.userId, parents: [],
  });
  return { id: art.id, type: "opportunity", version: art.version };
}

export async function runDefine(projectId: string) {
  const session = await requireCap("artifact:write");
  const opportunity = await latest(projectId, "opportunity");
  if (!opportunity) throw new Error("no opportunity — run Discover first");
  const res = await router().route({
    prompt_key: "define.proposition",
    vars: { opportunity: JSON.stringify(opportunity.payload) },
    project_id: projectId,
  });
  const payload = { ...parseJsonObject(res.text), status: "draft" };
  const art = await lineage().createArtifact({
    project_id: projectId, type: "proposition", payload, created_by: session.userId, parents: [opportunity.id],
  });
  return { id: art.id, type: "proposition", version: art.version, status: "draft" };
}

// Sign-off is an immutable-append: a new proposition version with status=signed_off.
export async function signoffProposition(projectId: string) {
  const session = await requireCap("artifact:approve");
  const prop = await latest(projectId, "proposition");
  if (!prop) throw new Error("no proposition — run Define first");
  if (prop.payload.status === "signed_off") return { id: prop.id, version: prop.version, status: "signed_off" };
  const art = await lineage().createArtifact({
    project_id: projectId, type: "proposition",
    payload: { ...prop.payload, status: "signed_off" },
    created_by: session.userId, parents: [prop.id],
  });
  return { id: art.id, version: art.version, status: "signed_off" };
}

export async function runArchitect(projectId: string, adr: Record<string, unknown>) {
  const session = await requireCap("artifact:write");
  const scope = await latest(projectId, "scope");
  if (!scope) throw new Error("no scope — run Specify first");
  const bp = String(adr.buildParadigm ?? "");
  const rs = String(adr.retrievalStrategy ?? "");
  if (!BUILD_PARADIGMS.includes(bp)) throw new Error(`invalid buildParadigm '${bp}'`);
  if (!RETRIEVAL_STRATEGIES.includes(rs)) throw new Error(`invalid retrievalStrategy '${rs}'`);
  const projections = (adr.storageProjections as string[]) ?? [];
  if ((rs === "graph" || rs === "graph_hybrid") && !projections.includes("neo4j")) {
    throw new Error("graph retrieval requires a neo4j storage projection");
  }
  const constraints = await latest(projectId, "constraints");
  const parents = constraints ? [scope.id, constraints.id] : [scope.id];
  const art = await lineage().createArtifact({
    project_id: projectId, type: "adr", payload: adr, created_by: session.userId, parents,
  });
  return { id: art.id, type: "adr", version: art.version };
}

function toCsv(plan: { epics?: { summary: string; stories?: { summary: string; points?: number }[] }[] }): string {
  const rows = ["Epic,Story,Points"];
  for (const e of plan.epics ?? []) {
    for (const s of e.stories ?? []) {
      rows.push(`"${e.summary}","${s.summary}",${s.points ?? ""}`);
    }
  }
  return rows.join("\n");
}

export async function runPlan(projectId: string) {
  const session = await requireCap("artifact:write");
  const scope = await latest(projectId, "scope");
  const adr = await latest(projectId, "adr");
  if (!scope || !adr) throw new Error("plan needs a scope and an adr");
  const res = await router().route({
    prompt_key: "plan.plan",
    vars: { scope: JSON.stringify(scope.payload), adr: JSON.stringify(adr.payload) },
    project_id: projectId,
  });
  const parsed = parseJsonObject<{ epics?: []; resourcing?: [] }>(res.text);
  const payload = { ...parsed, csv: toCsv(parsed) };
  const art = await lineage().createArtifact({
    project_id: projectId, type: "plan", payload, created_by: session.userId, parents: [scope.id, adr.id],
  });
  return { id: art.id, type: "plan", version: art.version };
}

// Gate 1: proposition signed off + an adr exists. Blocks until both hold.
export async function checkGate1(projectId: string) {
  const prop = await latest(projectId, "proposition");
  const adr = await latest(projectId, "adr");
  const reasons: string[] = [];
  if (!prop || prop.payload.status !== "signed_off") reasons.push("proposition not signed off");
  if (!adr) reasons.push("no adr");
  const pass = reasons.length === 0;
  let gateId: string | undefined;
  if (pass) {
    const existing = await latest(projectId, "gate1");
    if (!existing) {
      const art = await lineage().createArtifact({
        project_id: projectId, type: "gate1",
        payload: { decision: "pass", proposition_id: prop!.id, adr_id: adr!.id },
        created_by: "gate", parents: [prop!.id, adr!.id],
      });
      gateId = art.id;
    } else {
      gateId = existing.id;
    }
  }
  return { pass, reasons, gateId };
}
