import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@agent-platform/design-system";

import { getSession } from "@/lib/auth";
import { lineage } from "@/lib/lineage";
import { can } from "@/lib/rbac";
import { EvaluatePanel } from "@/components/EvaluatePanel";
import { LineageView } from "@/components/LineageView";

export const dynamic = "force-dynamic";

const EVAL = (process.env.EVAL_URL || "http://localhost:8792").replace(/\/$/, "");

export default async function EvaluatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await lineage().getProject(slug);
  if (!project) notFound();

  const session = await getSession();
  const canWrite = session ? can(session.role, "artifact:write") : false;
  const canApprove = session ? can(session.role, "artifact:approve") : false;

  const graph = await lineage().getLineage(project.id);
  const latest = (type: string) =>
    graph.nodes.filter((n) => n.type === type).sort((a, b) => b.version - a.version)[0];

  const agentVersion = latest("agent_version");
  const testSuite = latest("test_suite");
  const evalRun = latest("eval_run");

  const policy = await fetch(`${EVAL}/v1/policy?project_id=${encodeURIComponent(project.id)}`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { pre_deploy_gates: {} }))
    .catch(() => ({ pre_deploy_gates: {} }));

  const suitePayload = testSuite?.payload as { cases?: unknown[] } | undefined;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link href={`/projects/${slug}`} className="text-[14px] text-ink-3 no-underline hover:text-brand">
          ← {project.name}
        </Link>
        <h1 className="mt-1 font-display text-3xl font-black text-ink">Prove — Test &amp; Evaluate</h1>
        <p className="text-ink-2">
          Generate a multi-persona test suite, score the agent (quality · latency · cost), and clear Gate 2
          before deploy.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How Prove fits</CardTitle>
          <CardDescription>Nothing deploys until it survives this page.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="ml-4 list-decimal text-[14px] text-ink-2 [&>li]:mb-1">
            <li>
              <span className="font-medium text-ink">Test</span> generates personas + tagged cases from the
              agent&apos;s system prompt (state: test_suite).
            </li>
            <li>
              <span className="font-medium text-ink">Evaluate</span> runs the suite, judges every answer with an
              LLM, and rolls quality up per persona (state: eval_run).
            </li>
            <li>
              <span className="font-medium text-ink">Gate 2</span> checks the eval against the project policy
              (thresholds + OPA rules + risk tier) — Deploy is blocked until it passes.
            </li>
          </ol>
        </CardContent>
      </Card>

      <EvaluatePanel
        projectId={project.id}
        agentVersionId={agentVersion?.id ?? null}
        agentVersion={agentVersion?.version ?? null}
        testSuiteId={testSuite?.id ?? null}
        testSuiteCases={suitePayload?.cases?.length ?? null}
        latestEvalRun={(evalRun?.payload as never) ?? null}
        initialGates={policy.pre_deploy_gates ?? {}}
        canWrite={canWrite}
        canApprove={canApprove}
      />

      <Card>
        <CardHeader>
          <CardTitle>Artifacts</CardTitle>
          <CardDescription>
            What Prove works with and produces — read the full test suite and eval run, or edit the suite (e.g.
            tweak a case) into a new version before re-running.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LineageView
            nodes={graph.nodes
              .filter((n) => ["agent_version", "test_suite", "eval_run"].includes(n.type))
              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())}
            canEdit={canWrite}
          />
        </CardContent>
      </Card>
    </div>
  );
}
