import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@agent-platform/design-system";

import { getSession } from "@/lib/auth";
import { getGroundState } from "@/lib/ground";
import { lineage } from "@/lib/lineage";
import { can } from "@/lib/rbac";
import { GroundPanel } from "@/components/GroundPanel";

export const dynamic = "force-dynamic";

export default async function GroundPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await lineage().getProject(slug);
  if (!project) notFound();

  const session = await getSession();
  const canWrite = session ? can(session.role, "artifact:write") : false;
  const canApprove = session ? can(session.role, "artifact:approve") : false;

  const state = await getGroundState(project.id);
  const g = await lineage().getLineage(project.id);
  const kbOutline = g.nodes.filter((n) => n.type === "kb_outline").sort((a, b) => b.version - a.version)[0];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link href={`/projects/${slug}`} className="text-[14px] text-ink-3 no-underline hover:text-brand">
          ← {project.name}
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="font-display text-3xl font-black text-ink">Knowledge base</h1>
          {state.release ? (
            <Badge tone="success">{state.release.releaseKey}</Badge>
          ) : (
            <Badge tone="neutral">no release yet</Badge>
          )}
        </div>
        <p className="text-ink-2">
          Ground · point at sources, ingest, approve (four-eyes), then cut the release agents consume.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How Ground fits</CardTitle>
          <CardDescription>You can build the KB up front — it doesn’t depend on the rest of the flow.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="ml-4 list-decimal text-[14px] text-ink-2 [&>li]:mb-1">
            <li>
              <span className="font-medium text-ink">Ingest</span> from any source → an immutable, safety-scanned revision
              (state: submitted).
            </li>
            <li>
              <span className="font-medium text-ink">Approve</span> each revision — a different user than the submitter
              (four-eyes governance).
            </li>
            <li>
              <span className="font-medium text-ink">Release</span> pins the approved revisions and enriches the graph;
              that release_key is what Build consumes.
            </li>
          </ol>
        </CardContent>
      </Card>

      <GroundPanel
        projectId={project.id}
        state={state}
        userId={session?.userId ?? ""}
        canWrite={canWrite}
        canApprove={canApprove}
        kbOutlineArtifactId={kbOutline?.id ?? null}
      />
    </div>
  );
}
