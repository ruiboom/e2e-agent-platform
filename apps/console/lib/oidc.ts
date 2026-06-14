// Real OIDC token verification behind the getSession() seam (H6).
// Validates an RS256 JWT against the IdP's JWKS (issuer + audience + expiry) and
// maps a role claim to the platform's 7-role model. Coexists with the dev-stub:
// a valid Bearer token wins; otherwise the dev cookie is used (unless
// SESSION_PROVIDER=oidc disables the stub entirely).
import { createRemoteJWKSet, jwtVerify } from "jose";

import type { Role, Session } from "./session";

const ISSUER = process.env.OIDC_ISSUER;
const AUDIENCE = process.env.OIDC_AUDIENCE;
const JWKS_URL = process.env.OIDC_JWKS_URL;
const ROLE_CLAIM = process.env.OIDC_ROLE_CLAIM || "role";

const VALID_ROLES: Role[] = [
  "viewer", "contributor", "steward", "approver", "taxonomy_manager", "admin", "compliance_approver",
];

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function jwks() {
  if (!_jwks && JWKS_URL) _jwks = createRemoteJWKSet(new URL(JWKS_URL));
  return _jwks;
}

export function oidcConfigured(): boolean {
  return Boolean(ISSUER && AUDIENCE && JWKS_URL);
}

function mapRole(claim: unknown): Role | null {
  const candidates = Array.isArray(claim) ? claim : [claim];
  const found = candidates.find((c) => typeof c === "string" && VALID_ROLES.includes(c as Role));
  return (found as Role) ?? null;
}

export async function verifyOidcToken(token: string): Promise<Session | null> {
  const set = jwks();
  if (!set || !ISSUER || !AUDIENCE) return null;
  try {
    const { payload } = await jwtVerify(token, set, { issuer: ISSUER, audience: AUDIENCE });
    const role = mapRole(payload[ROLE_CLAIM]);
    if (!role) return null;
    return {
      userId: String(payload.sub ?? "oidc"),
      name: String(payload.name ?? payload.sub ?? "OIDC user"),
      role,
    };
  } catch {
    return null;
  }
}
