import Link from "next/link";
import { notFound } from "next/navigation";

import { lineage } from "@/lib/lineage";
import { ShapePanel } from "@/components/ShapePanel";

export const dynamic = "force-dynamic";

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

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link href={`/projects/${slug}`} className="text-[14px] text-ink-3 no-underline hover:text-brand">
          ← {project.name}
        </Link>
        <h1 className="mt-1 font-display text-3xl font-black text-ink">Shape &amp; plan</h1>
        <p className="text-ink-2">Discover → Define → Specify → Architect → Plan, gated by Gate 1.</p>
      </div>
      <ShapePanel projectId={project.id} state={state} />
    </div>
  );
}
