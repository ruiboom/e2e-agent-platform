// Server-side proxy to the model-router. Keeps the router URL + provider keys
// off the browser and injects the resolved identity as trusted headers.
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";

const ROUTER_URL = (process.env.MODEL_ROUTER_URL || "http://localhost:8789").replace(/\/$/, "");

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(`${ROUTER_URL}/v1/route`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AP-User": session.userId,
        "X-AP-Role": session.role,
      },
      body: JSON.stringify({ vars: {}, ...body }),
    });
    const data = await res.json().catch(() => ({ error: "non-JSON response from router" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { error: `router unreachable: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
}
