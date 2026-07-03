"use client";
import { useState } from "react";

import { Button, Label, Textarea } from "@agent-platform/design-system";

// Field-level editor for an artifact payload. String fields edit as plain text
// (markdown welcome); everything else edits as JSON. Saving appends a NEW
// version via /api/artifacts — the original is never mutated.
export function ArtifactEditor({
  artifactId,
  payload,
  onSaved,
  onCancel,
}: {
  artifactId: string;
  payload: Record<string, unknown>;
  onSaved: (v: { id: string; type: string; version: number }) => void;
  onCancel: () => void;
}) {
  const entries = Object.entries(payload ?? {});
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      entries.map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v, null, 2)]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    const next: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      const raw = fields[k] ?? "";
      if (typeof v === "string") {
        next[k] = raw;
      } else {
        try {
          next[k] = JSON.parse(raw);
        } catch {
          setErr(`“${k}” is not valid JSON`);
          return;
        }
      }
    }
    setBusy(true);
    try {
      const res = await fetch("/api/artifacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactId, payload: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? JSON.stringify(data));
      onSaved(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[14px] text-ink-3">This artifact has an empty payload — nothing to edit.</p>
        <div>
          <Button size="sm" variant="secondary" onClick={onCancel}>Close</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map(([k, v]) => {
        const value = fields[k] ?? "";
        // Size to content: hard newlines plus an estimate for soft-wrapped long lines.
        const estimatedLines = value.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 90)), 0);
        const rows = Math.min(Math.max(estimatedLines + 1, 3), 18);
        return (
          <div key={k}>
            <Label className="font-mono text-[12px] text-ink-3">
              {k}
              {typeof v !== "string" && <span className="ml-1.5 font-sans normal-case text-ink-3">(JSON)</span>}
            </Label>
            <Textarea
              rows={rows}
              value={value}
              onChange={(e) => setFields((f) => ({ ...f, [k]: e.target.value }))}
              className={typeof v === "string" ? "" : "font-mono text-[12.5px]"}
            />
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save as new version"}
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <span className="text-[12px] text-ink-3">immutable append — the current version is kept in the lineage</span>
      </div>
      {err && <p className="text-[14px] text-danger">{err}</p>}
    </div>
  );
}
