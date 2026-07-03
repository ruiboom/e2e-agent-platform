import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@agent-platform/design-system";

import { getSession } from "@/lib/auth";
import { lineage } from "@/lib/lineage";
import { can } from "@/lib/rbac";
import { LineageView } from "@/components/LineageView";
import { specifyAction } from "./actions";

export const dynamic = "force-dynamic";

const SPEC_TYPES = ["scope", "system_prompt", "kb_outline"];

export default async function SpecifyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await lineage().getProject(slug);
  if (!project) notFound();

  const session = await getSession();
  const mayWrite = session ? can(session.role, "artifact:write") : false;

  const g = await lineage().getLineage(project.id);
  const outputs = g.nodes
    .filter((n) => SPEC_TYPES.includes(n.type))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link href={`/projects/${slug}`} className="text-[14px] text-ink-3 no-underline hover:text-brand">
          ← {project.name}
        </Link>
        <h1 className="mt-1 font-display text-3xl font-black text-ink">Specify</h1>
        <p className="text-ink-2">
          Turn a topic into a <span className="font-mono">scope</span>,{" "}
          <span className="font-mono">system_prompt</span> and{" "}
          <span className="font-mono">kb_outline</span> — three linked lineage artifacts.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate spec</CardTitle>
          <CardDescription>One model-router call; emits the genesis artifacts.</CardDescription>
        </CardHeader>
        <CardContent>
          {mayWrite ? (
            <form action={specifyAction} className="flex flex-col gap-4">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="projectId" value={project.id} />
              <div>
                <Label htmlFor="topic">Topic</Label>
                <Input id="topic" name="topic" placeholder="A help assistant for UK current accounts" required />
              </div>
              <Button type="submit">Generate spec</Button>
            </form>
          ) : (
            <p className="text-ink-3">Your role can&apos;t write artifacts.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outputs</CardTitle>
          <CardDescription>
            The spec artifacts — read them rendered, or edit one into a new version before Build picks it up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LineageView nodes={outputs} canEdit={mayWrite} />
        </CardContent>
      </Card>
    </div>
  );
}
