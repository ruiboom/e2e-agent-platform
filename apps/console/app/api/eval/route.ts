// Eval (Prove) proxy: test-suite generation, suite runs, quick evals, policy
// and Gate 2 — keeps the eval service URL off the browser and injects identity.
// Dispatch on { action, ... }.
//
//   testsuite  { agentVersionId }                       -> artifact:write
//   run-suite  { agentVersionId, testSuiteId }          -> artifact:write
//   eval       { agentVersionId, questions? }           -> artifact:write
//   get-policy { projectId }                            -> project:read
//   set-policy { projectId, preDeployGates, opaRules? } -> artifact:approve
//   gate2      { projectId, agentVersionId, context? }  -> project:read
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { can, type Capability } from "@/lib/rbac";

const EVAL = (process.env.EVAL_URL || "http://localhost:8792").replace(/\/$/, "");

async function call(path: string, init: RequestInit) {
  const res = await fetch(`${EVAL}${path}`, init);
  const data = await res.json().catch(() => ({ error: "non-JSON from eval" }));
  return { data, status: res.status };
}

function post(path: string, body: unknown, userId: string, role: string) {
  return call(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-AP-User": userId, "X-AP-Role": role },
    body: JSON.stringify(body),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action as string | undefined;

  const require = (cap: Capability) => {
    if (!can(session.role, cap)) {
      return NextResponse.json({ error: `forbidden: ${cap}` }, { status: 403 });
    }
    return null;
  };

  try {
    let out: { data: unknown; status: number };
    switch (action) {
      case "testsuite": {
        const denied = require("artifact:write");
        if (denied) return denied;
        if (!body.agentVersionId) return NextResponse.json({ error: "agentVersionId is required" }, { status: 400 });
        out = await post("/v1/testsuite", { agent_version_id: body.agentVersionId }, session.userId, session.role);
        break;
      }
      case "run-suite": {
        const denied = require("artifact:write");
        if (denied) return denied;
        if (!body.agentVersionId || !body.testSuiteId) {
          return NextResponse.json({ error: "agentVersionId and testSuiteId are required" }, { status: 400 });
        }
        out = await post(
          "/v1/run-suite",
          { agent_version_id: body.agentVersionId, test_suite_id: body.testSuiteId },
          session.userId,
          session.role,
        );
        break;
      }
      case "eval": {
        const denied = require("artifact:write");
        if (denied) return denied;
        if (!body.agentVersionId) return NextResponse.json({ error: "agentVersionId is required" }, { status: 400 });
        out = await post(
          "/v1/eval",
          { agent_version_id: body.agentVersionId, questions: body.questions ?? null },
          session.userId,
          session.role,
        );
        break;
      }
      case "get-policy": {
        if (!body.projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
        out = await call(`/v1/policy?project_id=${encodeURIComponent(body.projectId as string)}`, { method: "GET" });
        break;
      }
      case "set-policy": {
        const denied = require("artifact:approve");
        if (denied) return denied;
        if (!body.projectId || typeof body.preDeployGates !== "object" || body.preDeployGates === null) {
          return NextResponse.json({ error: "projectId and preDeployGates are required" }, { status: 400 });
        }
        out = await post(
          "/v1/policy",
          { project_id: body.projectId, pre_deploy_gates: body.preDeployGates, opa_rules: body.opaRules ?? null },
          session.userId,
          session.role,
        );
        break;
      }
      case "gate2": {
        if (!body.projectId || !body.agentVersionId) {
          return NextResponse.json({ error: "projectId and agentVersionId are required" }, { status: 400 });
        }
        out = await post(
          "/v1/gate2",
          { project_id: body.projectId, agent_version_id: body.agentVersionId, context: body.context ?? null },
          session.userId,
          session.role,
        );
        break;
      }
      default:
        return NextResponse.json({ error: `unknown action '${action}'` }, { status: 400 });
    }
    return NextResponse.json(out.data as object, { status: out.status });
  } catch (e) {
    return NextResponse.json(
      { error: `eval unreachable: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
}
