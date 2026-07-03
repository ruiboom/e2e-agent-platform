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
  Textarea,
} from "@agent-platform/design-system";

export interface PromptDraft {
  template: string;
  updated_by: string;
  updated_at: string;
}
export interface PromptEntry {
  key: string;
  name: string;
  active_version: number | null;
  template: string | null;
  default_model: string | null;
  draft: PromptDraft | null;
}
export interface BundleInfo {
  version: number;
  prompt_count: number;
  approved_by: string;
  created_at: string;
}
export interface PromptSet {
  prompts: PromptEntry[];
  draft_count: number;
  bundle: BundleInfo | null;
  bundles: BundleInfo[];
}

// Which pipeline process each prompt powers — grouping only, not behaviour.
const GROUPS: { title: string; blurb: string; keys: string[] }[] = [
  {
    title: "Generation",
    blurb: "Shape the thread: opportunity → proposition → spec → plan, and the live agent's answers.",
    keys: ["discover.opportunity", "define.proposition", "specify.spec", "plan.plan", "agent.answer"],
  },
  {
    title: "Transformation",
    blurb: "Rewrite artifacts into new forms: agent configs, improved prompts, graph enrichment.",
    keys: ["agent.generate_config", "operate.improve", "graph.enrich"],
  },
  {
    title: "Evaluation",
    blurb: "Prove the agent: test-suite generation and the LLM judge.",
    keys: ["test.suite", "eval.judge"],
  },
];

export function PromptAdminPanel({ initial }: { initial: PromptSet }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function post(body: Record<string, unknown>, label: string, ok: (d: Record<string, unknown>) => string) {
    setBusy(label);
    setErr(null);
    setNote(null);
    try {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? data.error ?? JSON.stringify(data));
      setNote(ok(data));
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const grouped = GROUPS.map((g) => ({
    ...g,
    prompts: initial.prompts.filter((p) => g.keys.includes(p.key)),
  }));
  const other = initial.prompts.filter((p) => !GROUPS.some((g) => g.keys.includes(p.key)));

  return (
    <div className="flex flex-col gap-4">
      {/* Bundle status + approve */}
      <Card>
        <CardHeader>
          <CardTitle>Approved prompt set</CardTitle>
          <CardDescription>
            Approval promotes every draft and snapshots all {initial.prompts.length} prompts as one bundle —
            the durable version the platform stands on.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {initial.bundle ? (
              <>
                <Badge tone="success">prompt set v{initial.bundle.version}</Badge>
                <span className="text-[13px] text-ink-3">
                  {initial.bundle.prompt_count} prompts · approved by {initial.bundle.approved_by} ·{" "}
                  {new Date(initial.bundle.created_at).toLocaleString()}
                </span>
              </>
            ) : (
              <Badge tone="neutral">no approved set yet — v1 is cut on first approval</Badge>
            )}
            {initial.draft_count > 0 && (
              <Badge tone="danger">
                {initial.draft_count} draft{initial.draft_count === 1 ? "" : "s"} live &amp; unapproved
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              disabled={busy !== null || initial.draft_count === 0}
              onClick={() =>
                post({ action: "approve" }, "approve", (d) => `Approved prompt set v${d.version} — ${d.prompt_count} prompts pinned.`)
              }
            >
              {busy === "approve" ? "Approving…" : `Approve → prompt set v${(initial.bundle?.version ?? 0) + 1}`}
            </Button>
            {initial.draft_count === 0 && (
              <span className="text-[13px] text-ink-3">nothing pending — edit a prompt below first</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Groups */}
      {[...grouped, ...(other.length ? [{ title: "Other", blurb: "Prompts outside the core pipeline.", keys: [], prompts: other }] : [])].map(
        (g) => (
          <Card key={g.title}>
            <CardHeader>
              <CardTitle>{g.title}</CardTitle>
              <CardDescription>{g.blurb}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {g.prompts.length === 0 && <p className="text-[14px] text-ink-3">No prompts seeded yet.</p>}
              {g.prompts.map((p) => (
                <PromptRow key={p.key} p={p} busy={busy} onSave={(tpl) =>
                  post({ action: "draft", key: p.key, template: tpl }, p.key,
                    () => `Draft saved — ${p.key} is live everywhere now. Approve to make it permanent.`)
                } onDiscard={() =>
                  post({ action: "discard", key: p.key }, p.key,
                    () => `Draft discarded — ${p.key} reverted to the approved set.`)
                } />
              ))}
            </CardContent>
          </Card>
        ),
      )}

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>Bundle history</CardTitle>
          <CardDescription>Every approved prompt-set version — always the full set, never a partial.</CardDescription>
        </CardHeader>
        <CardContent>
          {initial.bundles.length === 0 ? (
            <p className="text-[14px] text-ink-3">No approvals yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {initial.bundles.map((b) => (
                <li key={b.version} className="flex items-center gap-2 text-[14px]">
                  <Badge tone="brand">v{b.version}</Badge>
                  <span className="text-ink-2">{b.prompt_count} prompts</span>
                  <span className="text-ink-3">· {b.approved_by} · {new Date(b.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {err && <p className="text-[14px] text-danger">{err}</p>}
      {note && <p className="text-[14px] text-success">{note}</p>}
    </div>
  );
}

function PromptRow({
  p,
  busy,
  onSave,
  onDiscard,
}: {
  p: PromptEntry;
  busy: string | null;
  onSave: (template: string) => void;
  onDiscard: () => void;
}) {
  const effective = p.draft?.template ?? p.template ?? "";
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(effective);
  const dirty = text !== effective;

  return (
    <div className="overflow-hidden rounded-md border border-line">
      <button
        type="button"
        onClick={() => { setOpen(!open); setText(effective); }}
        className="flex w-full items-center gap-2 bg-surface-page/40 px-3 py-2 text-left hover:bg-surface-page"
      >
        <span className="font-mono text-[13px] text-ink">{p.key}</span>
        <span className="truncate text-[13px] text-ink-3">{p.name}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {p.active_version !== null && <Badge tone="neutral">v{p.active_version}</Badge>}
          {p.draft && <Badge tone="danger">draft live</Badge>}
          <span className="font-mono text-ink-3">{open ? "−" : "+"}</span>
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-line p-3">
          {p.draft && (
            <p className="text-[12.5px] text-ink-3">
              Draft by {p.draft.updated_by} · {new Date(p.draft.updated_at).toLocaleString()} — routing uses this
              template <span className="font-medium">now</span>; approve the set to keep it, discard to revert.
            </p>
          )}
          <Textarea
            rows={Math.min(Math.max(text.split("\n").length + 1, 6), 24)}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="font-mono text-[12.5px]"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={busy !== null || !dirty || !text.trim()} onClick={() => onSave(text)}>
              {busy === p.key ? "Saving…" : "Save draft (live at once)"}
            </Button>
            {p.draft && (
              <Button size="sm" variant="secondary" disabled={busy !== null} onClick={onDiscard}>
                Discard draft
              </Button>
            )}
            <span className="text-[12px] text-ink-3">
              Jinja2 template{p.default_model ? <> · default model <span className="font-mono">{p.default_model}</span></> : null}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
