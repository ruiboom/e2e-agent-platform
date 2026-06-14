"use server";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { runSpecify } from "@/lib/specify";

export async function specifyAction(formData: FormData): Promise<void> {
  const session = await getSession();
  const slug = String(formData.get("slug") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const topic = String(formData.get("topic") ?? "");

  await runSpecify(session, projectId, topic);
  redirect(`/projects/${slug}?tab=lineage`);
}
