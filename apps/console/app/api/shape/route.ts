// Shape & plan dispatch: { action, projectId, ... }. RBAC + errors handled in lib/stages.
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { checkGate1, runArchitect, runDefine, runDiscover, runPlan, signoffProposition } from "@/lib/stages";

export async function POST(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { action, projectId } = body;
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  try {
    let result: unknown;
    switch (action) {
      case "discover": result = await runDiscover(projectId, body.problem ?? ""); break;
      case "define": result = await runDefine(projectId); break;
      case "signoff": result = await signoffProposition(projectId); break;
      case "architect": result = await runArchitect(projectId, body.adr ?? {}); break;
      case "plan": result = await runPlan(projectId); break;
      case "gate1": result = await checkGate1(projectId); break;
      default: return NextResponse.json({ error: `unknown action '${action}'` }, { status: 400 });
    }
    return NextResponse.json(result as object);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 400;
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
