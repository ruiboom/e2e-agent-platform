"use client";
import { useState } from "react";

import { Badge } from "@agent-platform/design-system";

import { ArtifactPayload } from "./ArtifactPayload";

interface Node {
  id: string;
  type: string;
  version: number;
  status: string;
  payload: unknown;
  parents: string[];
}

// Expandable list of artifacts — click one to read its full payload (the output).
export function LineageView({ nodes, openFirst = false }: { nodes: Node[]; openFirst?: boolean }) {
  const [open, setOpen] = useState<string | null>(openFirst ? (nodes[0]?.id ?? null) : null);

  if (nodes.length === 0) {
    return <p className="text-ink-3">No artifacts yet — run the stage above to produce one.</p>;
  }

  return (
    <ol className="flex flex-col gap-2">
      {nodes.map((n) => {
        const isOpen = open === n.id;
        return (
          <li key={n.id} className="overflow-hidden rounded-md border border-line">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : n.id)}
              className="flex w-full items-center gap-3 bg-surface-page/40 px-3 py-2.5 text-left hover:bg-surface-page"
            >
              <Badge tone="brand">{n.type} v{n.version}</Badge>
              <Badge>{n.status}</Badge>
              <span className="text-[13px] text-ink-3">
                {n.parents.length} parent{n.parents.length === 1 ? "" : "s"}
              </span>
              <span className="ml-auto font-mono text-ink-3">{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && (
              <div className="border-t border-line p-4">
                <ArtifactPayload value={n.payload} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
