"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from "@agent-platform/design-system";

interface State {
  hasOpportunity: boolean;
  propositionStatus: string | null;
  hasScope: boolean;
  hasAdr: boolean;
  hasPlan: boolean;
  gate1Pass: boolean;
}

export function ShapePanel({ projectId, slug, state }: { projectId: string; slug: string; state: State }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [problem, setProblem] = useState("");

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/shape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? JSON.stringify(data));
      router.refresh();
      return data;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const signed = state.propositionStatus === "signed_off";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shape &amp; plan</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Discover */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Badge tone={state.hasOpportunity ? "success" : "neutral"}>1 · Discover</Badge>
          </div>
          {!state.hasOpportunity && (
            <div className="flex gap-2">
              <Input value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="Problem / opportunity…" />
              <Button size="sm" disabled={busy || !problem.trim()} onClick={() => act({ action: "discover", problem })}>
                Discover
              </Button>
            </div>
          )}
        </div>

        {/* Define + sign off */}
        <div className="flex items-center gap-2">
          <Badge tone={state.propositionStatus ? "success" : "neutral"}>2 · Define</Badge>
          {state.hasOpportunity && !state.propositionStatus && (
            <Button size="sm" disabled={busy} onClick={() => act({ action: "define" })}>Define proposition</Button>
          )}
          {state.propositionStatus && (
            <>
              <Badge tone={signed ? "success" : "neutral"}>{state.propositionStatus}</Badge>
              {!signed && (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => act({ action: "signoff" })}>
                  Sign off
                </Button>
              )}
            </>
          )}
        </div>

        {/* Specify (link) */}
        <div className="flex items-center gap-2">
          <Badge tone={state.hasScope ? "success" : "neutral"}>3 · Specify</Badge>
          {!state.hasScope && <span className="text-[13px] text-ink-3">use the Specify page (after sign-off)</span>}
        </div>

        {/* Architect — editable agent-graph canvas */}
        <div className="flex items-center gap-2">
          <Badge tone={state.hasAdr ? "success" : "neutral"}>4 · Architect</Badge>
          {state.hasScope && (
            <Link href={`/projects/${slug}/architect`} className="no-underline">
              <Button size="sm" variant="secondary">
                {state.hasAdr ? "Edit agent graph →" : "Design agent graph →"}
              </Button>
            </Link>
          )}
          {!state.hasScope && <span className="text-[13px] text-ink-3">after Specify</span>}
        </div>

        {/* Plan */}
        <div className="flex items-center gap-2">
          <Badge tone={state.hasPlan ? "success" : "neutral"}>5 · Plan</Badge>
          {state.hasScope && state.hasAdr && !state.hasPlan && (
            <Button size="sm" disabled={busy} onClick={() => act({ action: "plan" })}>Generate plan</Button>
          )}
        </div>

        {/* Gate 1 */}
        <div className="flex items-center gap-2 border-t border-line pt-3">
          <Badge tone={state.gate1Pass ? "success" : "danger"}>Gate 1</Badge>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => act({ action: "gate1" })}>
            Check Gate 1
          </Button>
          <span className="text-[13px] text-ink-3">
            {state.gate1Pass ? "passed — proposition signed off + ADR present" : "blocked until proposition signed off + ADR"}
          </span>
        </div>

        {err && <p className="text-[14px] text-danger">{err}</p>}
      </CardContent>
    </Card>
  );
}
