import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PromptAdminPanel, type PromptSet } from "@/components/PromptAdminPanel";

export const dynamic = "force-dynamic";

const ROUTER = (process.env.MODEL_ROUTER_URL || "http://localhost:8789").replace(/\/$/, "");

export default async function PromptAdminPage() {
  const session = await getSession();
  const mayAdmin = session ? can(session.role, "prompt:activate") : false;

  if (!mayAdmin) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-3xl font-black text-ink">Prompt set</h1>
        <p className="mt-2 text-ink-3">
          This is the platform&apos;s engine room — it needs the <span className="font-mono">prompt:activate</span>{" "}
          capability (admin).
        </p>
      </div>
    );
  }

  let promptSet: PromptSet | null = null;
  let err: string | null = null;
  try {
    const res = await fetch(`${ROUTER}/v1/prompt-set`, { cache: "no-store" });
    if (!res.ok) throw new Error(`model-router returned ${res.status}`);
    promptSet = (await res.json()) as PromptSet;
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="font-display text-3xl font-black text-ink">Prompt set</h1>
        <p className="mt-1 text-ink-2">
          Every prompt powering generation, transformation and evaluation. Edits go live{" "}
          <span className="font-medium">immediately</span> as drafts — try them anywhere in the app — but stay
          draft until approved. Approval snapshots the <span className="font-medium">complete set</span> as one
          immutable bundle version: full bundle every version, no prompt ever deviates on its own.
        </p>
      </div>
      {promptSet ? (
        <PromptAdminPanel initial={promptSet} />
      ) : (
        <p className="text-danger">model-router unreachable: {err}</p>
      )}
    </div>
  );
}
