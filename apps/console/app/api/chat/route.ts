// Chat proxy to the build-runtime (keeps service URLs off the browser).
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";

const RUNTIME = (process.env.BUILD_RUNTIME_URL || "http://localhost:8791").replace(/\/$/, "");

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!body.agentVersionId || !body.question) {
    return NextResponse.json({ error: "agentVersionId and question are required" }, { status: 400 });
  }
  try {
    const res = await fetch(`${RUNTIME}/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-AP-User": session.userId, "X-AP-Role": session.role },
      body: JSON.stringify({
        agent_version_id: body.agentVersionId,
        question: body.question,
        user_id: session.userId,
      }),
    });
    const data = await res.json().catch(() => ({ error: "non-JSON from build-runtime" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { error: `build-runtime unreachable: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
}
