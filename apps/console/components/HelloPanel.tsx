"use client";
import { useState } from "react";

import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@agent-platform/design-system";

interface RouteResult {
  text: string;
  model: string;
  tokens: { input: number; output: number };
  cost_usd: number;
  latency_ms: number;
  prompt_version: number;
}

export function HelloPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RouteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sayHello() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt_key: "hello.greeting", vars: {}, project_id: "console-hello" }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.detail ?? data.error ?? JSON.stringify(data));
      else setResult(data as RouteResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Say hello through the router</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button onClick={sayHello} disabled={loading}>
          {loading ? "Calling…" : "Say hello"}
        </Button>

        {error && (
          <p className="rounded-md border border-danger bg-[var(--lb-error-bg)] p-3 text-[14px] text-danger">
            {error}
          </p>
        )}

        {result && (
          <div className="flex flex-col gap-3">
            <p className="rounded-md bg-brand-calm p-4 text-[18px] text-ink">{result.text}</p>
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">model: {result.model}</Badge>
              <Badge tone="neutral">in {result.tokens.input} / out {result.tokens.output} tok</Badge>
              <Badge tone="success">${result.cost_usd.toFixed(6)}</Badge>
              <Badge tone="neutral">{result.latency_ms} ms</Badge>
              <Badge tone="neutral">prompt v{result.prompt_version}</Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
