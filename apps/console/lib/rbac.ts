// Role-based capabilities. Reuses the KMS 7-role model. Pure (edge-safe) so the
// middleware and server components share one source of truth.
import type { Role, Session } from "./session";

export type Capability =
  | "project:read"
  | "project:create"
  | "artifact:approve"
  | "prompt:activate";

const ALL_ROLES: Role[] = [
  "viewer",
  "contributor",
  "steward",
  "approver",
  "taxonomy_manager",
  "admin",
  "compliance_approver",
];

// Which roles hold each capability. `admin` is granted everything explicitly.
const CAPABILITIES: Record<Capability, Role[]> = {
  "project:read": ALL_ROLES,
  "project:create": ["contributor", "steward", "admin"],
  "artifact:approve": ["approver", "steward", "admin", "compliance_approver"],
  "prompt:activate": ["admin"],
};

export function can(role: Role, cap: Capability): boolean {
  if (role === "admin") return true;
  return CAPABILITIES[cap]?.includes(role) ?? false;
}

export function requireCap(session: Session | null, cap: Capability): void {
  if (!session || !can(session.role, cap)) {
    const err = new Error(`forbidden: ${cap}`) as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}

// Route-segment guards enforced in middleware. First matching prefix wins.
export const ROUTE_CAPABILITIES: { prefix: string; cap: Capability }[] = [
  { prefix: "/projects/new", cap: "project:create" },
];
