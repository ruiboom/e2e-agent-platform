import Link from "next/link";
import { notFound } from "next/navigation";

import { lineage } from "@/lib/lineage";
import { ArchitectCanvas } from "@/components/ArchitectCanvas";

export const dynamic = "force-dynamic";

type Kind = "input" | "guardrails" | "retrieve" | "generate" | "output";
const defaults: Record<Kind, { label: string; config: Record<string, unknown> }> = {
  input: { label: "User message", config: {} },
  guardrails: { label: "Guardrails", config: { pii: true, injection: true } },
  retrieve: { label: "Retrieve", config: { mode: "vector", k: 4 } },
  generate: { label: "Generate", config: { paradigm: "code", model: "claude-haiku-4-5" } },
  output: { label: "Answer", config: { channels: ["web"] } },
};

// Build the editable graph: from a saved adr.graph if present, else a default
// pipeline derived from the adr's retrieval strategy + paradigm.
function buildGraph(adrPayload: Record<string, unknown> | undefined) {
  const saved = adrPayload?.graph as { nodes?: any[]; edges?: any[] } | undefined;
  if (saved?.nodes?.length) {
    return {
      nodes: saved.nodes.map((n, i) => ({
        id: n.id ?? `n${i}`, type: "agent",
        position: n.position ?? { x: i * 180, y: 120 },
        data: { label: n.label, kind: n.kind, config: n.config ?? {} },
      })),
      edges: (saved.edges ?? []).map((e) => ({ id: e.id ?? `${e.source}-${e.target}`, source: e.source, target: e.target, animated: true })),
    };
  }
  const mode = (adrPayload?.retrievalStrategy as string) ?? "vector";
  const paradigm = (adrPayload?.buildParadigm as string) ?? "code";
  const channels = (adrPayload?.channels as string[]) ?? ["web"];
  const order: Kind[] = ["input", "guardrails", "retrieve", "generate", "output"];
  const cfg: Record<Kind, Record<string, unknown>> = {
    ...Object.fromEntries(order.map((k) => [k, { ...defaults[k].config }])) as Record<Kind, Record<string, unknown>>,
  };
  cfg.retrieve = { mode, k: 4 };
  cfg.generate = { paradigm, model: "claude-haiku-4-5" };
  cfg.output = { channels };
  const nodes = order.map((k, i) => ({
    id: k, type: "agent", position: { x: i * 185, y: 120 },
    data: { label: defaults[k].label, kind: k, config: cfg[k] },
  }));
  const edges = order.slice(1).map((k, i) => ({ id: `${order[i]}-${k}`, source: order[i]!, target: k, animated: true }));
  return { nodes, edges };
}

export default async function ArchitectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await lineage().getProject(slug);
  if (!project) notFound();

  const g = await lineage().getLineage(project.id);
  const adr = g.nodes.filter((n) => n.type === "adr").sort((a, b) => b.version - a.version)[0];
  const hasScope = g.nodes.some((n) => n.type === "scope");
  const { nodes, edges } = buildGraph(adr?.payload as Record<string, unknown> | undefined);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/projects/${slug}/shape`} className="text-[14px] text-ink-3 no-underline hover:text-brand">
          ← Shape &amp; plan
        </Link>
        <h1 className="mt-1 font-display text-3xl font-black text-ink">Architect — agent graph</h1>
        <p className="text-ink-2">
          Design the agent as an editable graph. Saving captures it as the{" "}
          <span className="font-mono">adr</span> artifact{adr ? ` (currently v${adr.version})` : ""} — the
          retrieve + generate nodes drive Build.
        </p>
      </div>

      {!hasScope && (
        <p className="rounded-md border border-line bg-surface-page p-3 text-[14px] text-ink-3">
          Tip: run <Link href={`/projects/${slug}/specify`} className="text-brand">Specify</Link> first — Architect
          reads the scope, and Build consumes what you capture here.
        </p>
      )}

      <ArchitectCanvas projectId={project.id} initialNodes={nodes} initialEdges={edges} />
    </div>
  );
}
