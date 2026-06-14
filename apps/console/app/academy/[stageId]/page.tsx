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

import { serviceHealth } from "@/lib/academy";
import { EXAMPLE_PROJECT, STAGES, exampleRoute, stageById } from "@/lib/enablement";

export const dynamic = "force-dynamic";

export default async function StageGuide({ params }: { params: Promise<{ stageId: string }> }) {
  const { stageId } = await params;
  const stage = stageById(stageId);
  if (!stage) notFound();

  const idx = STAGES.findIndex((s) => s.id === stage.id);
  const prev = STAGES[idx - 1];
  const next = STAGES[idx + 1];
  const health = await serviceHealth();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <Link href="/academy" className="text-[14px] text-ink-3 no-underline hover:text-brand">
          ← Academy
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="font-display text-3xl font-black text-ink">{stage.name}</h1>
          <Badge tone="neutral">{stage.phase}</Badge>
          <Badge tone={health[stage.service] ? "success" : "danger"}>{health[stage.service] ? "live" : "down"}</Badge>
        </div>
        <p className="mt-1 text-ink-2">{stage.blurb}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-[15px] leading-relaxed text-ink">{stage.howItWorks}</p>
          <dl className="grid grid-cols-[80px_1fr] gap-y-2 text-[14px]">
            <dt className="text-ink-3">Reads</dt>
            <dd className="text-ink">{stage.reads}</dd>
            <dt className="text-ink-3">Writes</dt>
            <dd className="font-mono text-[13px] text-ink">{stage.writes}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Try it</CardTitle>
          <CardDescription>
            Open this stage in the worked example (<span className="font-mono">{EXAMPLE_PROJECT}</span>).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={exampleRoute(stage)} className="no-underline">
            <Button size="sm">Open {stage.name} in the example →</Button>
          </Link>
        </CardContent>
      </Card>

      <div className="flex justify-between border-t border-line pt-4">
        {prev ? (
          <Link href={`/academy/${prev.id}`} className="text-[14px] text-ink-2 no-underline hover:text-brand">
            ← {prev.name}
          </Link>
        ) : <span />}
        {next ? (
          <Link href={`/academy/${next.id}`} className="text-[14px] text-ink-2 no-underline hover:text-brand">
            {next.name} →
          </Link>
        ) : <span />}
      </div>
    </div>
  );
}
