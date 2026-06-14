"use server";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { lineage } from "@/lib/lineage";
import { can } from "@/lib/rbac";

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export async function createProjectAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || !can(session.role, "project:create")) {
    throw new Error("forbidden: project:create");
  }
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("name is required");
  const domain = String(formData.get("domain") ?? "").trim() || null;
  const slug = slugify(String(formData.get("slug") ?? "") || name);

  const project = await lineage().createProject({ slug, name, domain, owner: session.userId });
  redirect(`/projects/${project.slug}`);
}
