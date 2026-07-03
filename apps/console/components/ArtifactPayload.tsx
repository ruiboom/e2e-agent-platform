import { Fragment, type ReactNode } from "react";

import { Markdown } from "./Markdown";

// Readable, recursive renderer for any artifact payload (no hooks — usable in
// server or client components). Markdown-ish strings render as rich text;
// arrays become lists; objects become labelled key/value grids.

const MD_HINT =
  /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|`{3})|\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]]+\]\([^)]+\)/;

export function isMarkdownish(s: string): boolean {
  return s.includes("\n") || MD_HINT.test(s);
}

function render(value: unknown, depth = 0): ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span className="text-ink-3">—</span>;
  }
  if (typeof value === "string") {
    return isMarkdownish(value) ? (
      <Markdown source={value} />
    ) : (
      <span className="whitespace-pre-wrap break-words">{value}</span>
    );
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="font-mono text-[13px]">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-ink-3">none</span>;
    return (
      <ul className="flex flex-col gap-1">
        {value.map((item, i) => (
          <li key={i} className="border-l-2 border-line pl-3">
            {render(item, depth + 1)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    return (
      <dl className="grid grid-cols-[minmax(96px,max-content)_1fr] gap-x-3 gap-y-1.5">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <Fragment key={k}>
            <dt className="font-mono text-[12px] text-ink-3">{k}</dt>
            <dd className="min-w-0 text-[14px] text-ink">{render(v, depth + 1)}</dd>
          </Fragment>
        ))}
      </dl>
    );
  }
  return <span>{String(value)}</span>;
}

export function ArtifactPayload({ value }: { value: unknown }) {
  return <div className="text-[14px] leading-relaxed">{render(value)}</div>;
}
