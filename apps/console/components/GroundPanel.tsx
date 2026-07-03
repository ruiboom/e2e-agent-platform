"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Textarea } from "@agent-platform/design-system";

import type { GroundState, KbItem } from "@/lib/ground";
import { Markdown } from "./Markdown";

type SourceKind = "paste" | "web" | "rss" | "github";

const SOURCE_TABS: { id: SourceKind; label: string; hint: string }[] = [
  { id: "paste", label: "Paste text", hint: "Paste a document directly (markdown headings become chunks)." },
  { id: "web", label: "Web page", hint: "Fetch a public URL; HTML is stripped to text." },
  { id: "rss", label: "RSS feed", hint: "Each feed item becomes a document." },
  { id: "github", label: "GitHub repo", hint: "owner/name — pulls the README, or specific paths." },
];

function slugFromTitle(t: string): string {
  return (
    "kb/" +
    t.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "kb/untitled"
  );
}

export function GroundPanel({
  projectId,
  state,
  userId,
  canWrite,
  canApprove,
  kbOutlineArtifactId,
}: {
  projectId: string;
  state: GroundState;
  userId: string;
  canWrite: boolean;
  canApprove: boolean;
  kbOutlineArtifactId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [kind, setKind] = useState<SourceKind>("paste");
  const [submittedBy, setSubmittedBy] = useState("ingest-bot");
  // paste
  const [title, setTitle] = useState("");
  const [pasteUri, setPasteUri] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  // connectors
  const [url, setUrl] = useState("");
  const [paths, setPaths] = useState("");

  async function post(body: Record<string, unknown>, ok: (data: Record<string, unknown>) => string) {
    setBusy(true);
    setErr(null);
    setNote(null);
    try {
      const res = await fetch("/api/ground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? JSON.stringify(data));
      setNote(ok(data));
      router.refresh();
      return data;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function ingest() {
    if (kind === "paste") {
      if (!pasteBody.trim()) return setErr("paste some content first");
      const uri = pasteUri.trim() || slugFromTitle(title || pasteBody.slice(0, 40));
      return post(
        { action: "ingest", submittedBy, docs: [{ uri, title: title.trim() || uri, body: pasteBody }] },
        (d) => `Ingested 1 document → ${summariseItems(d.items)}.`,
      );
    }
    if (!url.trim()) return setErr("enter a source URL / repo first");
    const connectKind = kind === "web" ? "web" : kind === "rss" ? "rss" : "github";
    const pathList = paths.trim() ? paths.split(",").map((p) => p.trim()).filter(Boolean) : null;
    return post(
      { action: "connect", kind: connectKind, url: url.trim(), paths: pathList, submittedBy },
      (d) => `Pulled from ${connectKind} → ${summariseItems(d.items)}.`,
    );
  }

  function approve(rev: string) {
    return post({ action: "approve", revisionId: rev }, () => "Approved (four-eyes satisfied).");
  }

  // Editing a document re-ingests it under the same URI → a new immutable
  // revision in the submitted state (it goes back through four-eyes).
  function saveDoc(it: KbItem, body: string) {
    return post(
      { action: "ingest", docs: [{ uri: it.uri, title: it.title ?? it.uri, body }] },
      () => `Saved ${it.uri} as revision ${it.revNumber + 1} — awaiting approval.`,
    );
  }

  function release() {
    return post(
      { action: "release", kbOutlineArtifactId, enrich: true },
      (d) => `Cut release ${d.release_key} pinning ${d.item_count} item(s); graph enriched.`,
    );
  }

  const tab = SOURCE_TABS.find((t) => t.id === kind)!;

  return (
    <div className="flex flex-col gap-4">
      {/* A — point at sources */}
      <Card>
        <CardHeader>
          <CardTitle>1 · Point at sources & ingest</CardTitle>
          <CardDescription>
            Pull content in first — pre-generate the knowledge base before building the agent. Each ingest creates an
            immutable, safety-scanned revision in the <span className="font-medium">submitted</span> state.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {SOURCE_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setKind(t.id)}
                className={`rounded-md border px-3 py-1.5 text-[14px] ${
                  t.id === kind ? "border-brand bg-brand/5 text-brand" : "border-line text-ink-2 hover:border-brand"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-[13px] text-ink-3">{tab.hint}</p>

          {kind === "paste" ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Overdraft interest & fees" />
                </div>
                <div>
                  <Label>URI (optional)</Label>
                  <Input value={pasteUri} onChange={(e) => setPasteUri(e.target.value)} placeholder="auto from title" />
                </div>
              </div>
              <div>
                <Label>Content</Label>
                <Textarea
                  rows={8}
                  value={pasteBody}
                  onChange={(e) => setPasteBody(e.target.value)}
                  placeholder={"# Heading\n\nText… use markdown headings — each becomes a retrievable chunk."}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <Label>{kind === "github" ? "Repository (owner/name)" : kind === "rss" ? "RSS feed URL" : "Page URL"}</Label>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={kind === "github" ? "octocat/Hello-World" : "https://…"}
                />
              </div>
              {kind === "github" && (
                <div>
                  <Label>Paths (optional, comma-separated)</Label>
                  <Input value={paths} onChange={(e) => setPaths(e.target.value)} placeholder="docs/overview.md, README.md (default: README)" />
                </div>
              )}
            </div>
          )}

          <div className="flex items-end justify-between gap-3 border-t border-line pt-3">
            <div className="w-56">
              <Label>Submitted by</Label>
              <Input value={submittedBy} onChange={(e) => setSubmittedBy(e.target.value)} placeholder="ingest-bot" />
              <p className="mt-1 text-[12px] text-ink-3">four-eyes: a different user must approve</p>
            </div>
            <Button disabled={busy || !canWrite} onClick={ingest}>
              {busy ? "Ingesting…" : "Ingest →"}
            </Button>
          </div>
          {!canWrite && <p className="text-[13px] text-ink-3">your role can’t ingest (needs artifact:write).</p>}
        </CardContent>
      </Card>

      {/* B — review & approve */}
      <Card>
        <CardHeader>
          <CardTitle>2 · Review & approve</CardTitle>
          <CardDescription>
            {state.items.length === 0
              ? "Nothing ingested yet."
              : `${state.items.length} item(s) · ${state.approvedCount} approved · ${state.submittedCount} awaiting approval.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {state.items.map((it) => (
            <ItemRow
              key={it.revisionId}
              it={it}
              userId={userId}
              canApprove={canApprove}
              canWrite={canWrite}
              busy={busy}
              onApprove={() => approve(it.revisionId)}
              onSave={(body) => saveDoc(it, body)}
            />
          ))}
          {state.items.length === 0 && <p className="text-[14px] text-ink-3">Ingest a source above to populate the store.</p>}
        </CardContent>
      </Card>

      {/* C — cut a release */}
      <Card>
        <CardHeader>
          <CardTitle>3 · Cut a release</CardTitle>
          <CardDescription>
            A release pins the latest <span className="font-medium">approved</span> revision of every item and enriches the
            graph. This is the immutable KB an agent_version consumes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {state.release ? (
            <div className="flex items-center gap-2 text-[14px]">
              <Badge tone="success">{state.release.releaseKey}</Badge>
              <span className="text-ink-2">pins {state.release.itemCount} item(s)</span>
              <span className="text-ink-3">· {new Date(state.release.createdAt).toLocaleString()}</span>
            </div>
          ) : (
            <p className="text-[14px] text-ink-3">No release yet.</p>
          )}
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              disabled={busy || !canWrite || state.approvedCount === 0}
              onClick={release}
            >
              {state.release ? "Cut new release →" : "Cut release →"}
            </Button>
            {state.approvedCount === 0 && (
              <span className="text-[13px] text-ink-3">approve at least one item first</span>
            )}
            {!kbOutlineArtifactId && state.approvedCount > 0 && (
              <span className="text-[13px] text-ink-3">tip: run Specify to link the release to a kb_outline</span>
            )}
          </div>
        </CardContent>
      </Card>

      {err && <p className="text-[14px] text-danger">{err}</p>}
      {note && <p className="text-[14px] text-success">{note}</p>}
    </div>
  );
}

function ItemRow({
  it,
  userId,
  canApprove,
  canWrite,
  busy,
  onApprove,
  onSave,
}: {
  it: KbItem;
  userId: string;
  canApprove: boolean;
  canWrite: boolean;
  busy: boolean;
  onApprove: () => void;
  onSave: (body: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(it.body);
  const ownSubmission = it.submittedBy === userId;
  const flagged = it.scan.pii + it.scan.injection > 0;
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="min-w-0 flex-1 text-left"
          title={open ? "Collapse" : "View the document"}
        >
          <div className="flex items-center gap-2">
            <Badge tone={it.state === "approved" ? "success" : it.state === "rejected" ? "danger" : "neutral"}>
              {it.state}
            </Badge>
            <span className="truncate text-[15px] font-medium text-ink">{it.title || it.uri}</span>
            <span className="font-mono text-[13px] text-ink-3">{open ? "−" : "+"}</span>
          </div>
          <p className="truncate text-[12px] text-ink-3">
            <span className="font-mono">{it.uri}</span> · rev {it.revNumber} · {it.chunks} chunk(s)
            {it.submittedBy ? <> · by {it.submittedBy}</> : null}
            {it.approvedBy ? <> · approved {it.approvedBy}</> : null}
            {flagged ? <> · ⚠ {it.scan.pii} PII / {it.scan.injection} injection</> : null}
          </p>
        </button>
        {it.state === "submitted" && (
          <div className="flex shrink-0 items-center gap-2">
            {ownSubmission && <span className="text-[12px] text-ink-3">your submission</span>}
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || !canApprove || ownSubmission}
              onClick={onApprove}
              title={ownSubmission ? "four-eyes: another approver must sign this off" : ""}
            >
              Approve
            </Button>
          </div>
        )}
      </div>
      {open && (
        <div className="border-t border-line bg-surface-page/30 p-3">
          {editing ? (
            <div className="flex flex-col gap-2">
              <Textarea
                rows={Math.min(Math.max(draft.split("\n").length + 1, 6), 20)}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={busy || !draft.trim()} onClick={() => onSave(draft)}>
                  Save as new revision
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setEditing(false); setDraft(it.body); }}>
                  Cancel
                </Button>
                <span className="text-[12px] text-ink-3">re-enters four-eyes review before the next release</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="max-h-96 overflow-y-auto rounded-md border border-line bg-surface p-4">
                <Markdown source={it.body} />
              </div>
              {canWrite && (
                <div>
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(true)}>
                    Edit document
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function summariseItems(items: unknown): string {
  if (!Array.isArray(items)) return "ok";
  const states = items.reduce<Record<string, number>>((acc, it) => {
    const s = (it as { state?: string }).state ?? "submitted";
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(states)
    .map(([s, n]) => `${n} ${s}`)
    .join(", ");
}
