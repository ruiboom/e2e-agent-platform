// Dev-stub login for scripts/automation (cookie-jar friendly). The UI uses the
// server action in app/login/actions.ts; this is the same thing for curl.
// Available only while SESSION_PROVIDER is the dev stub.
import { NextResponse, type NextRequest } from "next/server";

import { setSession } from "@/lib/auth";
import { CANNED_USERS } from "@/lib/session";

export async function POST(req: NextRequest) {
  if ((process.env.SESSION_PROVIDER || "dev-stub") !== "dev-stub") {
    return NextResponse.json({ error: "dev-login disabled" }, { status: 404 });
  }
  const user = req.nextUrl.searchParams.get("user") ?? "";
  const session = CANNED_USERS[user];
  if (!session) {
    return NextResponse.json({ error: `unknown user '${user}'` }, { status: 400 });
  }
  await setSession(session);
  return NextResponse.json({ ok: true, userId: session.userId, role: session.role });
}
