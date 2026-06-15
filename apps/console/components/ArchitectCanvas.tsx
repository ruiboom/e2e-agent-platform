"use client";
import "@xyflow/react/dist/style.css";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@agent-platform/design-system";

type Kind = "input" | "guardrails" | "retrieve" | "generate" | "tool" | "output";
type NodeData = { label: string; kind: Kind; config: Record<string, unknown> };

const RETRIEVAL_MODES = ["vector", "lexical", "hybrid", "graph", "graph_hybrid"];
const PARADIGMS = ["code", "canvas", "flow", "yaml", "langgraph", "generative"];

const KIND_COLOR: Record<Kind, string> = {
  input: "var(--lb-ink-3, #6b7280)",
  guardrails: "#b45309",
  retrieve: "#0f766e",
  generate: "#1d4ed8",
  tool: "#7c3aed",
  output: "#15803d",
};

function summary(d: NodeData): string {
  const c = d.config;
  if (d.kind === "retrieve") return `${c.mode} · k=${c.k}`;
  if (d.kind === "generate") return `${c.paradigm} · ${c.model}`;
  if (d.kind === "guardrails") return `${c.injection ? "injection " : ""}${c.pii ? "pii" : ""}`.trim() || "off";
  if (d.kind === "tool") return String(c.name ?? "");
  if (d.kind === "output") return ((c.channels as string[]) ?? []).join(", ");
  return "";
}

function AgentNode({ data, selected }: NodeProps) {
  const d = data as NodeData;
  return (
    <div
      className="rounded-md border bg-surface px-3 py-2 shadow-sm"
      style={{ borderColor: selected ? "var(--lb-primary, #006a4d)" : "var(--lb-line, #e5e7eb)", minWidth: 150 }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: KIND_COLOR[d.kind] }}>
        {d.kind}
      </div>
      <div className="text-[14px] font-semibold text-ink">{d.label}</div>
      {summary(d) && <div className="text-[11px] text-ink-3">{summary(d)}</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { agent: AgentNode };

let _seq = 100;
const nextId = () => `n${++_seq}`;

function newNode(kind: Kind, x: number, y: number): Node {
  const defaults: Record<Kind, NodeData> = {
    input: { label: "User message", kind: "input", config: {} },
    guardrails: { label: "Guardrails", kind: "guardrails", config: { pii: true, injection: true } },
    retrieve: { label: "Retrieve", kind: "retrieve", config: { mode: "vector", k: 4 } },
    generate: { label: "Generate", kind: "generate", config: { paradigm: "code", model: "claude-haiku-4-5" } },
    tool: { label: "Tool", kind: "tool", config: { name: "kb_search" } },
    output: { label: "Answer", kind: "output", config: { channels: ["web"] } },
  };
  return { id: nextId(), type: "agent", position: { x, y }, data: defaults[kind] };
}

export function ArchitectCanvas({
  projectId,
  initialNodes,
  initialEdges,
}: {
  projectId: string;
  initialNodes: Node[];
  initialEdges: Edge[];
}) {
  const router = useRouter();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selId, setSelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge({ ...c, animated: true }, eds)), [setEdges]);
  const sel = useMemo(() => nodes.find((n) => n.id === selId) ?? null, [nodes, selId]);

  function setConfig(key: string, value: unknown) {
    if (!selId) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selId ? { ...n, data: { ...n.data, config: { ...(n.data as NodeData).config, [key]: value } } } : n,
      ),
    );
  }
  function setLabel(value: string) {
    if (!selId) return;
    setNodes((nds) => nds.map((n) => (n.id === selId ? { ...n, data: { ...n.data, label: value } } : n)));
  }
  function add(kind: Kind) {
    setNodes((nds) => [...nds, newNode(kind, 80 + Math.round(Math.random() * 80), 60 + nds.length * 12)]);
  }
  function removeSelected() {
    if (!selId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selId));
    setEdges((eds) => eds.filter((e) => e.source !== selId && e.target !== selId));
    setSelId(null);
  }

  async function save() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const find = (k: Kind) => nodes.find((n) => (n.data as NodeData).kind === k)?.data as NodeData | undefined;
    const retrievalStrategy = (find("retrieve")?.config.mode as string) ?? "vector";
    const buildParadigm = (find("generate")?.config.paradigm as string) ?? "code";
    const channels = (find("output")?.config.channels as string[]) ?? ["web"];
    const storageProjections = ["pgvector", ...(["graph", "graph_hybrid"].includes(retrievalStrategy) ? ["neo4j"] : [])];
    const graph = {
      nodes: nodes.map((n) => ({ id: n.id, ...(n.data as NodeData), position: n.position })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    };
    const adr = { buildParadigm, runtime: "rag-v1", retrievalStrategy, storageProjections, channels, deployTarget: "local", graph };
    try {
      const res = await fetch("/api/shape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "architect", projectId, adr }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? JSON.stringify(data));
      setMsg(`Saved as adr v${data.version} (${buildParadigm} · ${retrievalStrategy})`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const d = sel?.data as NodeData | undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-ink-3">Add:</span>
        {(["retrieve", "generate", "guardrails", "tool", "output"] as Kind[]).map((k) => (
          <Button key={k} size="sm" variant="secondary" onClick={() => add(k)}>+ {k}</Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {msg && <span className="text-[13px] text-success">{msg}</span>}
          {err && <span className="text-[13px] text-danger">{err}</span>}
          <Button size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save architecture"}</Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        <div className="h-[560px] overflow-hidden rounded-md border border-line">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelId(n.id)}
            onPaneClick={() => setSelId(null)}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-[16px]">{sel ? "Edit node" : "Inspector"}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!sel || !d ? (
              <p className="text-[13px] text-ink-3">
                Click a node to edit it. Drag from a node&apos;s right handle to its neighbour&apos;s left to connect.
                The <span className="font-mono">retrieve</span> and <span className="font-mono">generate</span> nodes
                drive Build&apos;s retrieval strategy + paradigm.
              </p>
            ) : (
              <>
                <Badge tone="brand">{d.kind}</Badge>
                <div>
                  <Label htmlFor="lbl">Label</Label>
                  <Input id="lbl" value={d.label} onChange={(e) => setLabel(e.target.value)} />
                </div>
                {d.kind === "retrieve" && (
                  <>
                    <div>
                      <Label>Retrieval mode</Label>
                      <select className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[14px]"
                        value={String(d.config.mode)} onChange={(e) => setConfig("mode", e.target.value)}>
                        {RETRIEVAL_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="k">k (chunks)</Label>
                      <Input id="k" type="number" value={String(d.config.k)} onChange={(e) => setConfig("k", Number(e.target.value))} />
                    </div>
                  </>
                )}
                {d.kind === "generate" && (
                  <>
                    <div>
                      <Label>Build paradigm</Label>
                      <select className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[14px]"
                        value={String(d.config.paradigm)} onChange={(e) => setConfig("paradigm", e.target.value)}>
                        {PARADIGMS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="model">Model</Label>
                      <Input id="model" value={String(d.config.model)} onChange={(e) => setConfig("model", e.target.value)} />
                    </div>
                  </>
                )}
                {d.kind === "guardrails" && (
                  <div className="flex flex-col gap-2 text-[14px]">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={Boolean(d.config.injection)} onChange={(e) => setConfig("injection", e.target.checked)} />
                      block prompt-injection
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={Boolean(d.config.pii)} onChange={(e) => setConfig("pii", e.target.checked)} />
                      redact PII
                    </label>
                  </div>
                )}
                {d.kind === "tool" && (
                  <div>
                    <Label htmlFor="tn">Tool name</Label>
                    <Input id="tn" value={String(d.config.name)} onChange={(e) => setConfig("name", e.target.value)} />
                  </div>
                )}
                {d.kind === "output" && (
                  <div>
                    <Label htmlFor="ch">Channels (comma-separated)</Label>
                    <Input id="ch" value={((d.config.channels as string[]) ?? []).join(", ")}
                      onChange={(e) => setConfig("channels", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
                  </div>
                )}
                <Button size="sm" variant="ghost" onClick={removeSelected} className="text-danger">Delete node</Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
