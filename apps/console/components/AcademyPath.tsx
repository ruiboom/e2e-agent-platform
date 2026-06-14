"use client";
import { useState } from "react";
import Link from "next/link";

import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@agent-platform/design-system";

interface StageLite {
  id: string;
  name: string;
  blurb: string;
}

export function AcademyPath({
  pathId,
  name,
  stages,
  initialDone,
}: {
  pathId: string;
  name: string;
  stages: StageLite[];
  initialDone: string[];
}) {
  const [done, setDone] = useState<string[]>(initialDone);
  const [busy, setBusy] = useState(false);
  const complete = stages.every((s) => done.includes(s.id));

  async function mark(stageId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/academy/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathId, stageId }),
      });
      const data = await res.json();
      if (res.ok) setDone(data.done);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {name}
          {complete ? <Badge tone="success">path complete</Badge> : <Badge tone="neutral">{done.length}/{stages.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {stages.map((s) => {
          const ok = done.includes(s.id);
          return (
            <div key={s.id} className="flex items-center gap-3 rounded-md border border-line p-3">
              <Badge tone={ok ? "success" : "neutral"}>{ok ? "✓" : "○"}</Badge>
              <div className="flex-1">
                <Link href={`/academy/${s.id}`} className="font-bold text-ink no-underline hover:text-brand">
                  {s.name} →
                </Link>
                <div className="text-[13px] text-ink-3">{s.blurb}</div>
              </div>
              {!ok && (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => mark(s.id)}>
                  Mark complete
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
