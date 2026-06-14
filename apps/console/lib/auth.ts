// Server-side session access. The single seam: swap dev-stub for OIDC here and
// the rest of the app (RBAC, route handlers) is unchanged.
import "server-only";
import { cookies } from "next/headers";

import { SESSION_COOKIE, signSession, verifySession, type Session } from "./session";

export async function getSession(): Promise<Session | null> {
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
