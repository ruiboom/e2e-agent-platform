import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@agent-platform/design-system";

import { lineage } from "@/lib/lineage";
import { ShapePanel } from "@/components/ShapePanel";
import { LineageView } from "@/components/LineageView";

export const dynamic = "force-dynamic";

const SHAPING_TYPES = ["opportunity", "proposition", "scope", "system_prompt", "kb_outline", "adr", "plan", "gate1"];

export default async function ShapePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await lineage().getProject(slug);
  if (!project) notFound();

  const g = await lineage().getLineage(project.id);
  const latest = (t: string) => g.nodes.filter((n) => n.type === t).sort((a, b) => b.version - a.version)[0];
  const prop = latest("proposition");

  const state = {
    hasOpportunity: Boolean(latest("opportunity")),
    propositionStatus: (prop?.payload.status as string) ?? null,
    hasScope: Boolean(latest("scope")),
    hasAdr: Boolean(latest("adr")),
    hasPlan: Boolean(latest("plan")),
    gate1Pass: Boolean(latest("gate1")),
  };

  const outputs = g.nodes
    .filter((n) => SHAPING_TYPES.includes(n.type))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link href={`/projects/${slug}`} className="text-[14px] text-ink-3 no-underline hover:text-brand">
          ← {project.name}
        </Link>
        <h1 className="mt-1 font-display text-3xl font-black text-ink">Shape &amp; plan</h1>
        <p className="text-ink-2">Discover → Define → Specify → Architect → Plan, gated by Gate 1.</p>
      </div>

      <ShapePanel projectId={project.id} slug={slug} state={state} />

      <Card>
        <CardHeader>
          <CardTitle>Outputs</CardTitle>
          <CardDescription>The artifacts each stage produced — click to read the content.</CardDescription>
        </CardHeader>
        <CardContent>
          <LineageView nodes={outputs} />
        </CardContent>
      </Card>
    </div>
  );
}
