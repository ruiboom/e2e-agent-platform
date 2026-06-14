// Pure session model + signing. NO next/node imports, so it runs in both the
// edge middleware and node server. Real OIDC later replaces only how a Session
// is obtained — the cookie format + RBAC stay.

export type Role =
  | "viewer"
  | "contributor"
  | "steward"
  | "approver"
  | "taxonomy_manager"
  | "admin"
  | "compliance_approver";

export interface Session {
  userId: string;
  name: string;
  role: Role;
}

export const SESSION_COOKIE = "ap_dev_user";

// Phase 0 dev-stub identities (the /login page lists these).
export const CANNED_USERS: Record<string, Session> = {
  alice: { userId: "alice", name: "Alice (admin)", role: "admin" },
  carol: { userId: "carol", name: "Carol (contributor)", role: "contributor" },
  bob: { userId: "bob", name: "Bob (viewer)", role: "viewer" },
};

const SECRET = process.env.SESSION_SECRET || "dev-only-change-me";
const enc = new TextEncoder();
const dec = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return toBase64Url(new Uint8Array(sig));
}

export async function signSession(s: Session): Promise<string> {
  const payload = toBase64Url(enc.encode(JSON.stringify(s)));
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if ((await hmac(payload)) !== sig) return null;
  try {
    return JSON.parse(dec.decode(fromBase64Url(payload))) as Session;
  } catch {
    return null;
  }
}
