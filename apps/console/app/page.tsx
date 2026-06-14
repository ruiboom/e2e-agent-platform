import Link from "next/link";

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@agent-platform/design-system";

import { getSession } from "@/lib/auth";

const TILES = [
  { href: "/projects", title: "Projects", body: "Create a project and trace its artifact lineage." },
  { href: "/hello", title: "Model router", body: 'Send a "hello" through the router; see tokens, cost & latency.' },
];

export default async function Home() {
  const session = await getSession();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl font-black text-ink">Agent Platform</h1>
        <p className="text-ink-2">
          Phase 0 backbone — the spine that carries the 0 → live → improve pipeline.
          {session ? <> Signed in as <Badge tone="brand">{session.role}</Badge>.</> : null}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {TILES.map((t) => (
          <Link key={t.href} href={t.href} className="no-underline">
            <Card className="h-full transition-shadow hover:shadow-2">
              <CardHeader>
                <CardTitle>{t.title}</CardTitle>
                <CardDescription>{t.body}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Milestone M0</CardTitle>
          <CardDescription>The walking skeleton is green when all four hold.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc text-[15px] text-ink-2">
            <li>Create a project → it persists in Postgres.</li>
            <li>The model router answers a &quot;hello&quot; call.</li>
            <li>Cost + latency show in the dashboard.</li>
            <li>RBAC blocks an unauthorised role.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
