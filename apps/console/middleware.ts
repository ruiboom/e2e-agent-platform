import { NextResponse, type NextRequest } from "next/server";

import { ROUTE_CAPABILITIES, can } from "./lib/rbac";
import { SESSION_COOKIE, verifySession } from "./lib/session";

// Protects page routes. (API route handlers enforce their own session + RBAC.)
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const guard = ROUTE_CAPABILITIES.find((g) => pathname.startsWith(g.prefix));
  if (guard && !can(session.role, guard.cap)) {
    return new NextResponse(
      `403 — ${session.name} (${session.role}) lacks capability ${guard.cap}`,
      { status: 403, headers: { "content-type": "text/plain" } },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login).*)"],
};
