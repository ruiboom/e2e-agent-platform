"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from "@agent-platform/design-system";

interface Provenance {
  release_key: string;
  agent_version: number;
  item_id: string | null;
  revision_id: string | null;
  chunk_id: string | null;
}
interface Msg {
  role: "user" | "agent";
  text: string;
  provenance?: Provenance;
  citations?: { item_id: string; chunk_id: string; score: number; heading_path: string | null }[];
}

export function ChatView({
  projectId,
  agentVersionId,
  agentVersion,
  hasDeployment,
  canBuild,
}: {
  projectId: string;
  agentVersionId: string | null;
  agentVersion: number | null;
  hasDeployment: boolean;
  canBuild: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);

  async function post(url: string, body: unknown) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? data.error ?? JSON.stringify(data));
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function build() {
    try {
      await post("/api/agent/build", { projectId });
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  async function deploy() {
    try {
      await post("/api/deploy", { agentVersionId });
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  async function send() {
    const question = input.trim();
    if (!question || !agentVersionId) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: question }]);
    try {
      const data = await post("/api/chat", { agentVersionId, question });
      setMsgs((m) => [...m, { role: "agent", text: data.answer, provenance: data.provenance, citations: data.citations }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (!agentVersionId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No agent built yet</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {canBuild ? (
            <>
              <p className="text-ink-2">Build an agent_version from this project&apos;s system_prompt + kb_release.</p>
              <Button onClick={build} disabled={busy}>{busy ? "Building…" : "Build agent"}</Button>
            </>
          ) : (
            <p className="text-ink-3">
              This project needs a <span className="font-mono">system_prompt</span> (Specify) and a{" "}
              <span className="font-mono">kb_release</span> (Ground ingest + release) before an agent can be built.
            </p>
          )}
          {err && <p className="text-[14px] text-danger">{err}</p>}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Badge tone="brand">agent v{agentVersion}</Badge>
        {hasDeployment ? (
          <Badge tone="success">deployed</Badge>
        ) : (
          <Button size="sm" variant="secondary" onClick={deploy} disabled={busy}>
            Deploy (emit deployment)
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-5">
          <div className="flex flex-col gap-3">
            {msgs.length === 0 && <p className="text-ink-3">Ask the grounded agent a question.</p>}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "self-end" : "self-start"}>
                <div
                  className={
                    m.role === "user"
                      ? "rounded-lg bg-brand px-4 py-2 text-ink-inverse"
                      : "rounded-lg bg-surface-page px-4 py-3 text-ink"
                  }
                >
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  {m.provenance && (
                    <div className="mt-2 flex flex-wrap gap-1 border-t border-line pt-2 text-[11px]">
                      <Badge tone="neutral">release {m.provenance.release_key}</Badge>
                      <Badge tone="neutral">agent v{m.provenance.agent_version}</Badge>
                      {m.provenance.item_id && <Badge tone="neutral">item {m.provenance.item_id.slice(0, 8)}</Badge>}
                      {m.provenance.revision_id && <Badge tone="neutral">rev {m.provenance.revision_id.slice(0, 8)}</Badge>}
                      {m.provenance.chunk_id && <Badge tone="neutral">chunk {m.provenance.chunk_id.slice(0, 8)}</Badge>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex gap-2"
          >
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question…" disabled={busy} />
            <Button type="submit" disabled={busy || !input.trim()}>Send</Button>
          </form>
          {err && <p className="text-[14px] text-danger">{err}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
