// Server-side session access. The single seam: real OIDC (Bearer token) and the
// dev-stub (signed cookie) both resolve here. A valid Bearer token wins; the dev
// cookie is honoured unless SESSION_PROVIDER=oidc disables the stub entirely.
import "server-only";
import { cookies, headers } from "next/headers";

import { oidcConfigured, verifyOidcToken } from "./oidc";
import { SESSION_COOKIE, signSession, verifySession, type Session } from "./session";

export async function getSession(): Promise<Session | null> {
  // 1. OIDC Bearer token (API clients / SSO) — verified against the IdP's JWKS.
  if (oidcConfigured()) {
    const auth = (await headers()).get("authorization") ?? "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) {
      const session = await verifyOidcToken(m[1]);
      if (session) return session;
    }
  }
  // 2. Dev-stub cookie (disabled when SESSION_PROVIDER=oidc).
  if ((process.env.SESSION_PROVIDER || "dev-stub") === "oidc") return null;
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

export async function setSession(session: Session): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
