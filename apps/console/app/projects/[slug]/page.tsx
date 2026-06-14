import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@agent-platform/design-system";

import { getSession } from "@/lib/auth";
import { lineage } from "@/lib/lineage";
import { can } from "@/lib/rbac";
import { LineageView } from "@/components/LineageView";

export const dynamic = "force-dynamic";

const TABS = ["overview", "lineage", "cost"] as const;
type Tab = (typeof TABS)[number];

export default async function ProjectDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "overview";

  const project = await lineage().getProject(slug);
  if (!project) notFound();

  const graph = await lineage().getLineage(project.id);
  const orderedNodes = [...graph.nodes].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const costUrl = process.env.NEXT_PUBLIC_COST_TRACKER_URL;
  const session = await getSession();
  const mayWrite = session ? can(session.role, "artifact:write") : false;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/projects" className="text-[14px] text-ink-3 no-underline hover:text-brand">
          ← Projects
        </Link>
        <h1 className="mt-1 font-display text-3xl font-black text-ink">{project.name}</h1>
        <p className="text-ink-3">
          <span className="font-mono">{project.slug}</span>
          {project.domain ? <> · {project.domain}</> : null} · owner {project.owner}
        </p>
      </div>

      {mayWrite && (
        <div className="flex gap-3">
          <Link href={`/projects/${project.slug}/shape`} className="no-underline">
            <Button size="sm" variant="secondary">Shape &amp; plan</Button>
          </Link>
          <Link href={`/projects/${project.slug}/specify`} className="no-underline">
            <Button size="sm" variant="secondary">Specify</Button>
          </Link>
          <Link href={`/projects/${project.slug}/chat`} className="no-underline">
            <Button size="sm" variant="secondary">Chat</Button>
          </Link>
        </div>
      )}

      <nav className="flex gap-2 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/projects/${project.slug}?tab=${t}`}
            className={`-mb-px border-b-2 px-3 py-2 text-[15px] capitalize no-underline ${
              t === tab ? "border-brand text-brand" : "border-transparent text-ink-2 hover:text-brand"
            }`}
          >
            {t}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>Project record in the canonical store.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-[15px]">
              <dt className="text-ink-3">Status</dt>
              <dd><Badge>{project.status}</Badge></dd>
              <dt className="text-ink-3">Artifacts</dt>
              <dd>{graph.nodes.length}</dd>
              <dt className="text-ink-3">Created</dt>
              <dd>{new Date(project.created_at).toLocaleString()}</dd>
            </dl>
          </CardContent>
        </Card>
      )}

      {tab === "lineage" && (
        <Card>
          <CardHeader>
            <CardTitle>Artifact lineage</CardTitle>
            <CardDescription>
              The golden thread — versioned, parent-linked artifacts. Populated as Phase-1 stages run.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LineageView nodes={orderedNodes} />
          </CardContent>
        </Card>
      )}

      {tab === "cost" && (
        <Card>
          <CardHeader>
            <CardTitle>Cost &amp; latency</CardTitle>
            <CardDescription>Live burn from the model router (cost-tracker dashboard).</CardDescription>
          </CardHeader>
          <CardContent>
            {costUrl ? (
              <iframe
                src={costUrl}
                title="cost-tracker"
                className="h-[600px] w-full rounded-md border border-line"
              />
            ) : (
              <p className="text-ink-3">NEXT_PUBLIC_COST_TRACKER_URL is not set.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
