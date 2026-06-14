import Link from "next/link";
import { notFound } from "next/navigation";

import { getSession } from "@/lib/auth";
import { lineage } from "@/lib/lineage";
import { ChatView } from "@/components/ChatView";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await lineage().getProject(slug);
  if (!project) notFound();
  await getSession();

  const graph = await lineage().getLineage(project.id);
  const latest = (type: string) =>
    graph.nodes.filter((n) => n.type === type).sort((a, b) => b.version - a.version)[0];

  const agentVersion = latest("agent_version");
  const canBuild = Boolean(latest("system_prompt") && latest("kb_release"));
  const hasDeployment = graph.nodes.some((n) => n.type === "deployment");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link href={`/projects/${slug}`} className="text-[14px] text-ink-3 no-underline hover:text-brand">
          ← {project.name}
        </Link>
        <h1 className="mt-1 font-display text-3xl font-black text-ink">Chat</h1>
        <p className="text-ink-2">Grounded vector-RAG agent. Every answer carries its provenance tuple.</p>
      </div>

      <ChatView
        projectId={project.id}
        agentVersionId={agentVersion?.id ?? null}
        agentVersion={agentVersion?.version ?? null}
        hasDeployment={hasDeployment}
        canBuild={canBuild}
      />
    </div>
  );
}
