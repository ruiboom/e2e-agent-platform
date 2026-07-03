"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@agent-platform/design-system";

import { LineageView, type LineageNode } from "./LineageView";

interface Diagnosis {
  total_logs: number;
  weak: number;
  weak_questions: string[];
}
interface OperateResult {
  status: "proposed" | "no_logs";
  diagnosis: Diagnosis;
  new_system_prompt_id?: string;
  new_version?: number;
  rationale?: string;
}

export function OperatePanel({
  slug,
  agentVersionId,
  agentVersion,
  hasDeployment,
  logCount,
  weakLogCount,
  proposals,
  canWrite,
}: {
  slug: string;
  agentVersionId: string | null;
  agentVersion: number | null;
  hasDeployment: boolean;
  logCount: number;
  weakLogCount: number;
  proposals: LineageNode[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<OperateResult | null>(null);

  async function runOperate() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/operate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentVersionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? data.error ?? JSON.stringify(data));
      setResult(data as OperateResult);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!agentVersionId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nothing to operate yet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-ink-3">
            Operate learns from a running agent&apos;s chat logs. Build (and ideally deploy) an agent on the{" "}
            <Link href={`/projects/${slug}/chat`} className="text-brand">
              Chat page
            </Link>{" "}
            and have a few conversations first.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="brand">agent v{agentVersion}</Badge>
        <Badge tone={hasDeployment ? "success" : "neutral"}>{hasDeployment ? "deployed" : "not deployed"}</Badge>
        <Badge tone="neutral">{logCount} chat turns logged</Badge>
        <Badge tone={weakLogCount > 0 ? "danger" : "success"}>{weakLogCount} weak</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Close the loop</CardTitle>
          <CardDescription>
            Detect weak / off-topic turns in the live logs, diagnose them, and propose an improved system prompt —
            emitted as a new system_prompt version. It&apos;s a proposal, never auto-promoted.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Button size="sm" disabled={!canWrite || busy || logCount === 0} onClick={runOperate}>
              {busy ? "Analysing logs…" : "Run Operate"}
            </Button>
            {logCount === 0 && (
              <span className="text-[13px] text-ink-3">
                no logs yet —{" "}
                <Link href={`/projects/${slug}/chat`} className="text-brand">
                  chat with the agent
                </Link>{" "}
                to generate some
              </span>
            )}
            {!canWrite && <span className="text-[13px] text-ink-3">needs artifact:write</span>}
          </div>

          {result && (
            <div className="flex flex-col gap-3 border-t border-line pt-4">
              {result.status === "no_logs" ? (
                <p className="text-ink-3">No logs to learn from yet.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="success">proposed system_prompt v{result.new_version}</Badge>
                    <Badge tone="neutral">
                      {result.diagnosis.weak} weak of {result.diagnosis.total_logs} turns
                    </Badge>
                  </div>
                  {result.diagnosis.weak_questions.length > 0 && (
                    <div>
                      <p className="text-[13px] font-medium text-ink-3">Weak questions diagnosed</p>
                      <ul className="ml-4 list-disc text-[14px] text-ink-2">
                        {result.diagnosis.weak_questions.map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.rationale && (
                    <div>
                      <p className="text-[13px] font-medium text-ink-3">Rationale</p>
                      <p className="text-[14px] text-ink">{result.rationale}</p>
                    </div>
                  )}
                  <p className="text-[14px] text-ink-2">
                    To adopt it, rebuild the agent on the{" "}
                    <Link href={`/projects/${slug}/chat`} className="text-brand">
                      Chat page
                    </Link>{" "}
                    — the new version re-enters the pipeline through Build → Prove → Deploy.
                  </p>
                </>
              )}
            </div>
          )}
          {err && <p className="text-[14px] text-danger">{err}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Improvement proposals</CardTitle>
          <CardDescription>
            system_prompt versions authored by Operate — open one to read the full proposed prompt and rationale,
            or edit it into a new version before rebuilding.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {proposals.length === 0 ? (
            <p className="text-ink-3">None yet — run Operate to create the first one.</p>
          ) : (
            <LineageView nodes={proposals} canEdit={canWrite} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
