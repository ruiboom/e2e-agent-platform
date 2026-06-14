"use server";
import { redirect } from "next/navigation";

import { clearSession, setSession } from "@/lib/auth";
import { CANNED_USERS } from "@/lib/session";

function safeNext(next: unknown): string {
  const s = String(next ?? "/");
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function login(formData: FormData): Promise<void> {
  const user = String(formData.get("user") ?? "");
  const next = safeNext(formData.get("next"));
  const session = CANNED_USERS[user];
  if (!session) redirect("/login");
  await setSession(session);
  redirect(next);
}

export async function logout(): Promise<void> {
  await clearSession();
  redirect("/login");
}
