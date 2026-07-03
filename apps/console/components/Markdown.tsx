import { type ReactNode } from "react";

// Dependency-free markdown → React renderer (no hooks — usable in server or
// client components). Covers the constructs agents actually emit: headings,
// paragraphs, bold/italic/strikethrough, inline code, fenced code blocks,
// links, ordered/unordered lists (nested), blockquotes, tables and rules.
// Everything is built as React elements — no innerHTML, so no injection risk.

// `_underscore_` emphasis is deliberately unsupported: artifact text is full of
// snake_case identifiers and it misfires constantly.
const INLINE =
  /(`+)(.+?)\1|\*\*([^*]+)\*\*|\*([^*\n]+)\*|~~([^~]+)~~|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/;

const SAFE_HREF = /^(https?:\/\/|\/|#|mailto:)/i;

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let k = 0;
  while (rest.length > 0) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    if (m[2] !== undefined) {
      out.push(
        <code key={k} className="rounded bg-surface-page px-1 py-0.5 font-mono text-[0.9em]">
          {m[2]}
        </code>,
      );
    } else if (m[3] !== undefined) {
      out.push(
        <strong key={k} className="font-semibold text-ink">
          {renderInline(m[3])}
        </strong>,
      );
    } else if (m[4] !== undefined) {
      out.push(<em key={k}>{renderInline(m[4])}</em>);
    } else if (m[5] !== undefined) {
      out.push(<del key={k}>{renderInline(m[5])}</del>);
    } else if (SAFE_HREF.test(m[7]!)) {
      out.push(
        <a key={k} href={m[7]} target="_blank" rel="noreferrer" className="text-brand underline underline-offset-2">
          {renderInline(m[6]!)}
        </a>,
      );
    } else {
      out.push(m[6]!);
    }
    rest = rest.slice(m.index + m[0].length);
    k++;
  }
  return out;
}

function splitRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

const HEADING_CLASSES = [
  "text-[19px]",
  "text-[17px]",
  "text-[15.5px]",
  "text-[14.5px]",
  "text-[14px]",
  "text-[13.5px]",
];
const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

const BLOCK_START = /^\s{0,3}(#{1,6}\s|>|`{3,}|~{3,}|[-*+]\s|\d+[.)]\s)|^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/;

function parseBlocks(src: string): ReactNode[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code block
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const close = fence[1];
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith(close)) {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing fence
      out.push(
        <pre
          key={key++}
          className="my-2 overflow-x-auto rounded-md border border-line bg-surface-page p-3 font-mono text-[12.5px] leading-relaxed text-ink first:mt-0 last:mb-0"
        >
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Heading
    const h = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const HTag = HEADING_TAGS[level - 1];
      out.push(
        <HTag key={key++} className={`${HEADING_CLASSES[level - 1]} mb-1 mt-3 font-semibold text-ink first:mt-0`}>
          {renderInline(h[2])}
        </HTag>,
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push(<hr key={key++} className="my-3 border-line" />);
      i++;
      continue;
    }

    // Blockquote
    if (/^\s{0,3}>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s{0,3}>\s?/, ""));
        i++;
      }
      out.push(
        <blockquote key={key++} className="my-2 border-l-2 border-brand/40 pl-3 text-ink-2">
          {parseBlocks(buf.join("\n"))}
        </blockquote>,
      );
      continue;
    }

    // Table (header row + |---| separator)
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:|-]+$/.test(lines[i + 1]) &&
      lines[i + 1].includes("-") &&
      lines[i + 1].includes("|")
    ) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push(
        <div key={key++} className="my-2 overflow-x-auto first:mt-0 last:mb-0">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-ink-3">
                {header.map((c, j) => (
                  <th key={j} className="py-1.5 pr-4 font-medium">
                    {renderInline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, j) => (
                <tr key={j} className="border-b border-line/50">
                  {r.map((c, cj) => (
                    <td key={cj} className="py-1.5 pr-4 align-top">
                      {renderInline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Lists (nested via indentation, collected into each item then re-parsed)
    const ul = line.match(/^(\s*)[-*+]\s+/);
    const ol = line.match(/^(\s*)\d+[.)]\s+/);
    if (ul || ol) {
      const ordered = Boolean(ol);
      const markerRe = ordered ? /^(\s*)\d+[.)]\s+/ : /^(\s*)[-*+]\s+/;
      const baseIndent = (ul ?? ol)![1].length;
      const items: string[][] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (!l.trim()) break;
        const m = l.match(markerRe);
        if (m && m[1].length <= baseIndent) {
          items.push([l.replace(markerRe, "")]);
        } else if (items.length > 0 && /^\s/.test(l)) {
          items[items.length - 1].push(l.replace(new RegExp(`^\\s{0,${baseIndent + 2}}`), ""));
        } else {
          break;
        }
        i++;
      }
      const ListTag = ordered ? ("ol" as const) : ("ul" as const);
      out.push(
        <ListTag
          key={key++}
          className={`my-1.5 ml-5 flex flex-col gap-1 first:mt-0 last:mb-0 ${ordered ? "list-decimal" : "list-disc"}`}
        >
          {items.map((it, j) => {
            const content = it.join("\n");
            return <li key={j}>{/\n/.test(content) ? parseBlocks(content) : renderInline(content)}</li>;
          })}
        </ListTag>,
      );
      continue;
    }

    // Paragraph — merge consecutive plain lines
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    out.push(
      <p key={key++} className="my-1.5 first:mt-0 last:mb-0">
        {renderInline(buf.join(" ").trim())}
      </p>,
    );
  }
  return out;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={`min-w-0 break-words text-[14px] leading-relaxed text-ink ${className ?? ""}`}>
      {parseBlocks(source)}
    </div>
  );
}
