"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@agent-platform/design-system";

import { ArtifactEditor } from "./ArtifactEditor";
import { ArtifactPayload } from "./ArtifactPayload";

export interface LineageNode {
  id: string;
  type: string;
  version: number;
  status: string;
  payload: unknown;
  parents: string[];
  created_at?: string | Date;
  created_by?: string;
}

type Mode = "rendered" | "json" | "edit";

// Expandable list of artifacts — click one to read its full payload, flip to
// the raw JSON, or (with artifact:write) edit it into a new version.
export function LineageView({
  nodes,
  openFirst = false,
  canEdit = false,
}: {
  nodes: LineageNode[];
  openFirst?: boolean;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(openFirst ? (nodes[0]?.id ?? null) : null);
  const [mode, setMode] = useState<Mode>("rendered");
  const [note, setNote] = useState<string | null>(null);

  if (nodes.length === 0) {
    return <p className="text-ink-3">No artifacts yet — run the stage above to produce one.</p>;
  }

  function toggle(id: string) {
    setOpen(open === id ? null : id);
    setMode("rendered");
    setNote(null);
  }

  return (
    <ol className="flex flex-col gap-2">
      {nodes.map((n) => {
        const isOpen = open === n.id;
        return (
          <li key={n.id} className="overflow-hidden rounded-md border border-line">
            <button
              type="button"
              onClick={() => toggle(n.id)}
              className="flex w-full items-center gap-3 bg-surface-page/40 px-3 py-2.5 text-left hover:bg-surface-page"
            >
              <Badge tone="brand">{n.type} v{n.version}</Badge>
              <Badge>{n.status}</Badge>
              <span className="text-[13px] text-ink-3">
                {n.parents.length} parent{n.parents.length === 1 ? "" : "s"}
              </span>
              {n.created_at && (
                <span className="hidden text-[12px] text-ink-3 sm:inline">
                  {new Date(n.created_at).toLocaleString()}
                </span>
              )}
              <span className="ml-auto font-mono text-ink-3">{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && (
              <div className="border-t border-line">
                <div className="flex items-center gap-1 border-b border-line bg-surface-page/40 px-3 py-1.5">
                  {(["rendered", "json"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`rounded px-2 py-0.5 text-[12.5px] capitalize ${
                        mode === m ? "bg-brand/10 font-medium text-brand" : "text-ink-3 hover:text-ink"
                      }`}
                    >
                      {m === "json" ? "JSON" : m}
                    </button>
                  ))}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setMode("edit")}
                      className={`rounded px-2 py-0.5 text-[12.5px] ${
                        mode === "edit" ? "bg-brand/10 font-medium text-brand" : "text-ink-3 hover:text-ink"
                      }`}
                    >
                      Edit
                    </button>
                  )}
                  {n.created_by && (
                    <span className="ml-auto text-[12px] text-ink-3">by {n.created_by}</span>
                  )}
                </div>
                <div className="p-4">
                  {mode === "rendered" && <ArtifactPayload value={n.payload} />}
                  {mode === "json" && (
                    <pre className="overflow-x-auto font-mono text-[12.5px] leading-relaxed text-ink">
                      {JSON.stringify(n.payload, null, 2)}
                    </pre>
                  )}
                  {mode === "edit" && (
                    <ArtifactEditor
                      artifactId={n.id}
                      payload={(n.payload ?? {}) as Record<string, unknown>}
                      onCancel={() => setMode("rendered")}
                      onSaved={(d) => {
                        setNote(`Saved as ${d.type} v${d.version} — this version is preserved as its parent.`);
                        setMode("rendered");
                        router.refresh();
                      }}
                    />
                  )}
                  {note && <p className="mt-3 text-[13px] text-success">{note}</p>}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
