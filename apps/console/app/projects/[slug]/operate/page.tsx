import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@agent-platform/design-system";

import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { lineage } from "@/lib/lineage";
import { can } from "@/lib/rbac";
import { OperatePanel } from "@/components/OperatePanel";

export const dynamic = "force-dynamic";

export default async function OperatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await lineage().getProject(slug);
  if (!project) notFound();

  const session = await getSession();
  const canWrite = session ? can(session.role, "artifact:write") : false;

  const graph = await lineage().getLineage(project.id);
  const latest = (type: string) =>
    graph.nodes.filter((n) => n.type === type).sort((a, b) => b.version - a.version)[0];

  const agentVersion = latest("agent_version");
  const hasDeployment = graph.nodes.some((n) => n.type === "deployment");

  let logCount = 0;
  let weakLogCount = 0;
  if (agentVersion) {
    const { rows } = await pool().query<{ total: string; weak: string }>(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE flagged OR (top_score IS NOT NULL AND top_score < 0.4)) AS weak
       FROM chat_log WHERE agent_version_id = $1`,
      [agentVersion.id],
    );
    logCount = Number(rows[0]?.total ?? 0);
    weakLogCount = Number(rows[0]?.weak ?? 0);
  }

  // system_prompt versions authored by the operate loop = the improvement proposals.
  const proposals = graph.nodes
    .filter((n) => n.type === "system_prompt" && (n.payload as { source?: string }).source === "operate")
    .sort((a, b) => b.version - a.version);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link href={`/projects/${slug}`} className="text-[14px] text-ink-3 no-underline hover:text-brand">
          ← {project.name}
        </Link>
        <h1 className="mt-1 font-display text-3xl font-black text-ink">Operate — Run &amp; improve</h1>
        <p className="text-ink-2">
          Learn from live chat logs and auto-propose an improved system prompt — closing the loop.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How Operate fits</CardTitle>
          <CardDescription>detect → diagnose → prescribe, over the deployed agent&apos;s real traffic.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="ml-4 list-decimal text-[14px] text-ink-2 [&>li]:mb-1">
            <li>
              <span className="font-medium text-ink">Detect</span> — every chat turn is logged with its retrieval
              score; weak or flagged turns are the signal.
            </li>
            <li>
              <span className="font-medium text-ink">Diagnose</span> — Operate pulls the worst turns and summarises
              what the agent is missing.
            </li>
            <li>
              <span className="font-medium text-ink">Prescribe</span> — a rewriter proposes an improved system
              prompt as a NEW version; rebuild to adopt it and the thread re-enters Prove.
            </li>
          </ol>
        </CardContent>
      </Card>

      <OperatePanel
        slug={slug}
        agentVersionId={agentVersion?.id ?? null}
        agentVersion={agentVersion?.version ?? null}
        hasDeployment={hasDeployment}
        logCount={logCount}
        weakLogCount={weakLogCount}
        proposals={proposals}
        canWrite={canWrite}
      />
    </div>
  );
}
