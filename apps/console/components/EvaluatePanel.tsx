"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@agent-platform/design-system";

interface Metrics {
  quality: number;
  latency_ms: number;
  cost_usd: number;
}
interface PerCase {
  persona?: string;
  question: string;
  score: number;
  class: string;
  commentary?: string;
}
interface EvalRunPayload {
  metrics: Metrics;
  perCase: PerCase[];
  perPersona?: Record<string, number>;
  gateResult: "pass" | "fail";
}
interface Gate2Result {
  pass: boolean;
  reasons: string[];
  metrics?: Metrics;
  gates?: Record<string, number>;
  risk_tier?: string;
  risk_signals?: string[];
}

export function EvaluatePanel({
  projectId,
  agentVersionId,
  agentVersion,
  testSuiteId,
  testSuiteCases,
  latestEvalRun,
  initialGates,
  canWrite,
  canApprove,
}: {
  projectId: string;
  agentVersionId: string | null;
  agentVersion: number | null;
  testSuiteId: string | null;
  testSuiteCases: number | null;
  latestEvalRun: EvalRunPayload | null;
  initialGates: Record<string, number>;
  canWrite: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [gate2, setGate2] = useState<Gate2Result | null>(null);
  const [quality, setQuality] = useState(initialGates.quality?.toString() ?? "0.6");
  const [latency, setLatency] = useState(initialGates.latency_ms?.toString() ?? "");
  const [cost, setCost] = useState(initialGates.cost_usd?.toString() ?? "");
  const [policySaved, setPolicySaved] = useState(false);

  async function post(body: unknown, label: string) {
    setBusy(label);
    setErr(null);
    try {
      const res = await fetch("/api/eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? data.error ?? JSON.stringify(data));
      return data;
    } finally {
      setBusy(null);
    }
  }

  const run = (body: unknown, label: string, after?: (data: unknown) => void) => async () => {
    try {
      const data = await post(body, label);
      after?.(data);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  async function savePolicy() {
    const gates: Record<string, number> = {};
    if (quality.trim()) gates.quality = Number(quality);
    if (latency.trim()) gates.latency_ms = Number(latency);
    if (cost.trim()) gates.cost_usd = Number(cost);
    try {
      await post({ action: "set-policy", projectId, preDeployGates: gates }, "policy");
      setPolicySaved(true);
      setTimeout(() => setPolicySaved(false), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (!agentVersionId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No agent to prove yet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-ink-3">
            Prove needs an <span className="font-mono">agent_version</span> — build one on the Chat page first
            (Specify → Ground → Build).
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Badge tone="brand">agent v{agentVersion}</Badge>
        {testSuiteId ? (
          <Badge tone="success">test suite · {testSuiteCases ?? "?"} cases</Badge>
        ) : (
          <Badge tone="neutral">no test suite yet</Badge>
        )}
        {latestEvalRun ? (
          <Badge tone={latestEvalRun.gateResult === "pass" ? "success" : "danger"}>
            last eval {latestEvalRun.gateResult}
          </Badge>
        ) : (
          <Badge tone="neutral">no eval run yet</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Test — generate the suite</CardTitle>
          <CardDescription>
            Multi-persona test cases (topic / behaviour / scope-boundary / out-of-scope) generated from the
            agent&apos;s system prompt.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            disabled={!canWrite || busy !== null}
            onClick={run({ action: "testsuite", agentVersionId }, "testsuite")}
          >
            {busy === "testsuite" ? "Generating…" : testSuiteId ? "Regenerate test suite" : "Generate test suite"}
          </Button>
          {!canWrite && <span className="text-[13px] text-ink-3">needs artifact:write</span>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evaluate — score the agent</CardTitle>
          <CardDescription>
            Run the suite (persona rollup) or a quick default-question eval. Each answer is judged by an LLM;
            quality / latency / cost aggregate into an eval_run.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              disabled={!canWrite || !testSuiteId || busy !== null}
              onClick={run({ action: "run-suite", agentVersionId, testSuiteId }, "suite")}
            >
              {busy === "suite" ? "Running suite…" : "Run test suite"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!canWrite || busy !== null}
              onClick={run({ action: "eval", agentVersionId }, "eval")}
            >
              {busy === "eval" ? "Evaluating…" : "Quick eval (default questions)"}
            </Button>
            {!testSuiteId && <span className="text-[13px] text-ink-3">generate a suite to enable the full run</span>}
          </div>

          {latestEvalRun && (
            <div className="flex flex-col gap-3 border-t border-line pt-4">
              <div className="flex flex-wrap gap-2">
                <Badge tone={latestEvalRun.gateResult === "pass" ? "success" : "danger"}>
                  {latestEvalRun.gateResult}
                </Badge>
                <Badge tone="neutral">quality {latestEvalRun.metrics.quality}</Badge>
                <Badge tone="neutral">latency {latestEvalRun.metrics.latency_ms} ms</Badge>
                <Badge tone="neutral">cost ${latestEvalRun.metrics.cost_usd}</Badge>
              </div>
              {latestEvalRun.perPersona && Object.keys(latestEvalRun.perPersona).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(latestEvalRun.perPersona).map(([p, s]) => (
                    <Badge key={p} tone={s >= 0.6 ? "success" : "danger"}>
                      {p}: {s}
                    </Badge>
                  ))}
                </div>
              )}
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-ink-3">
                    <th className="py-1 pr-3 font-medium">Question</th>
                    <th className="py-1 pr-3 font-medium">Persona</th>
                    <th className="py-1 pr-3 font-medium">Score</th>
                    <th className="py-1 font-medium">Class</th>
                  </tr>
                </thead>
                <tbody>
                  {latestEvalRun.perCase.map((c, i) => (
                    <tr key={i} className="border-b border-line/50 align-top">
                      <td className="py-1.5 pr-3 text-ink">
                        {c.question}
                        {c.commentary && <p className="mt-0.5 text-[12px] text-ink-3">{c.commentary}</p>}
                      </td>
                      <td className="py-1.5 pr-3 text-ink-2">{c.persona ?? "—"}</td>
                      <td className="py-1.5 pr-3 font-mono">{c.score}</td>
                      <td className="py-1.5">
                        <Badge tone={c.score >= 0.6 ? "success" : "danger"}>{c.class}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Policy — pre-deploy gates</CardTitle>
          <CardDescription>
            Thresholds Gate 2 enforces before any deploy. Saving needs an approver role (separation of duties).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="gate-quality">Min quality (0–1)</Label>
              <Input id="gate-quality" value={quality} onChange={(e) => setQuality(e.target.value)} placeholder="0.6" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="gate-latency">Max latency (ms)</Label>
              <Input id="gate-latency" value={latency} onChange={(e) => setLatency(e.target.value)} placeholder="unset" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="gate-cost">Max cost (USD)</Label>
              <Input id="gate-cost" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="unset" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="secondary" disabled={!canApprove || busy !== null} onClick={savePolicy}>
              {busy === "policy" ? "Saving…" : "Save policy"}
            </Button>
            {policySaved && <Badge tone="success">saved</Badge>}
            {!canApprove && <span className="text-[13px] text-ink-3">needs artifact:approve</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gate 2 — clearance to deploy</CardTitle>
          <CardDescription>
            Checks the latest eval_run against the policy thresholds and OPA-style rules (with a risk tier).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div>
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={run({ action: "gate2", projectId, agentVersionId }, "gate2", (d) => setGate2(d as Gate2Result))}
            >
              {busy === "gate2" ? "Checking…" : "Check Gate 2"}
            </Button>
          </div>
          {gate2 && (
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <div className="flex flex-wrap gap-2">
                <Badge tone={gate2.pass ? "success" : "danger"}>{gate2.pass ? "pass — may deploy" : "blocked"}</Badge>
                {gate2.risk_tier && <Badge tone="neutral">risk {gate2.risk_tier}</Badge>}
              </div>
              {gate2.reasons.length > 0 && (
                <ul className="ml-4 list-disc text-[14px] text-danger">
                  {gate2.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {err && <p className="text-[14px] text-danger">{err}</p>}
    </div>
  );
}
