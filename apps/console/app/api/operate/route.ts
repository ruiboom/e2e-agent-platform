// Operate (Run & improve) proxy: close the loop from live chat logs — the
// optimise service diagnoses weak turns and proposes an improved system_prompt
// as a NEW artifact version (never auto-promoted).
//
//   { agentVersionId } -> artifact:write
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";

const OPTIMISE = (process.env.OPTIMISE_URL || "http://localhost:8793").replace(/\/$/, "");

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!can(session.role, "artifact:write")) {
    return NextResponse.json({ error: "forbidden: artifact:write" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { agentVersionId?: string };
  if (!body.agentVersionId) {
    return NextResponse.json({ error: "agentVersionId is required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${OPTIMISE}/v1/operate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-AP-User": session.userId, "X-AP-Role": session.role },
      body: JSON.stringify({ agent_version_id: body.agentVersionId }),
    });
    const data = await res.json().catch(() => ({ error: "non-JSON from optimise" }));
    return NextResponse.json(data as object, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { error: `optimise unreachable: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
}
