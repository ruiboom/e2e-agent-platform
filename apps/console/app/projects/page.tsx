import Link from "next/link";

import { Badge, Button, Card, CardHeader, CardTitle, CardDescription } from "@agent-platform/design-system";

import { getSession } from "@/lib/auth";
import { lineage } from "@/lib/lineage";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const session = await getSession();
  const projects = await lineage().listProjects();
  const mayCreate = session ? can(session.role, "project:create") : false;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-black text-ink">Projects</h1>
        {mayCreate ? (
          <Link href="/projects/new" className="no-underline">
            <Button>New project</Button>
          </Link>
        ) : (
          <span className="text-[14px] text-ink-3">Your role can&apos;t create projects.</span>
        )}
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No projects yet</CardTitle>
            <CardDescription>Create one to start the golden thread.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.slug}`} className="no-underline">
              <Card className="h-full transition-shadow hover:shadow-2">
                <CardHeader>
                  <CardTitle>{p.name}</CardTitle>
                  <CardDescription>
                    <span className="font-mono">{p.slug}</span>
                    {p.domain ? <> · {p.domain}</> : null}
                  </CardDescription>
                  <div className="mt-1 flex gap-2">
                    <Badge>{p.status}</Badge>
                    <Badge tone="neutral">owner: {p.owner}</Badge>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
