import Link from "next/link";

import { Badge } from "@agent-platform/design-system";

import { logout } from "@/app/login/actions";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/academy", label: "Academy" },
  { href: "/hello", label: "Hello" },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const nav = session && can(session.role, "prompt:activate")
    ? [...NAV, { href: "/admin/prompts", label: "Prompts" }]
    : NAV;
  return (
    <div className="min-h-screen bg-surface-page">
      {session && (
        <header className="sticky top-0 z-10 border-b border-line bg-surface">
          <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-6">
            <Link href="/" className="font-display text-lg font-black text-brand no-underline">
              Agent Platform
            </Link>
            <nav className="flex items-center gap-4 text-[15px]">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className="text-ink-2 no-underline hover:text-brand">
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-[14px] text-ink-2">{session.name}</span>
              <Badge tone="brand">{session.role}</Badge>
              <form action={logout}>
                <button className="text-[14px] text-ink-3 underline hover:text-brand">Sign out</button>
              </form>
            </div>
          </div>
        </header>
      )}
      <main className="mx-auto max-w-[1200px] px-6 py-8">{children}</main>
    </div>
  );
}
