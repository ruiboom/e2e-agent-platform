// Projects API. POST is the RBAC gate M0 exercises (viewer -> 403).
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { lineage } from "@/lib/lineage";
import { can } from "@/lib/rbac";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json({ projects: await lineage().listProjects() });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!can(session.role, "project:create")) {
    return NextResponse.json(
      { error: `forbidden: ${session.role} cannot project:create` },
      { status: 403 },
    );
  }
  const body = await req.json().catch(() => ({}));
  const name: string = body.name ?? "";
  if (!name.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const slug = (body.slug && slugify(body.slug)) || slugify(name);
  try {
    const project = await lineage().createProject({
      slug,
      name,
      domain: body.domain ?? null,
      owner: session.userId,
    });
    return NextResponse.json(project, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const conflict = msg.includes("duplicate") || msg.includes("unique");
    return NextResponse.json({ error: msg }, { status: conflict ? 409 : 500 });
  }
}
