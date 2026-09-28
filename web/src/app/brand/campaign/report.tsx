import type { ReactNode } from "react";

// Small markdown renderer for the agent's final report: paragraphs, headings, bullet lists,
// pipe tables, **bold** and `code`. Enough for the report format in brainbase/instructions.md.

type Block = { kind: "p" | "h" | "ul" | "table"; lines: string[] };

function blocks(md: string): Block[] {
  const out: Block[] = [];
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    const kind: Block["kind"] | null = !line.trim()
      ? null
      : line.trim().startsWith("|")
        ? "table"
        : /^\s*[-*] /.test(line)
          ? "ul"
          : /^#{1,6} /.test(line)
            ? "h"
            : "p";
    if (!kind) {
      out.push({ kind: "p", lines: [] });
      continue;
    }
    const last = out[out.length - 1];
    if (last && last.kind === kind && kind !== "h" && last.lines.length > 0) last.lines.push(line);
    else out.push({ kind, lines: [line] });
  }
  return out.filter((b) => b.lines.length > 0);
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="font-semibold text-primary">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="rounded bg-secondary px-1 py-0.5 text-xs">{part.slice(1, -1)}</code>;
    return part;
  });
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

function Table({ lines }: { lines: string[] }) {
  const rows = lines.filter((l) => !/^\s*\|?\s*:?-{3,}/.test(l)).map(cells);
  const [head, ...body] = rows;
  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-secondary ring-inset">
      <table className="w-full text-left text-sm">
        <thead className="bg-secondary text-xs text-tertiary">
          <tr>{head?.map((h, i) => <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">{inline(h)}</th>)}</tr>
        </thead>
        <tbody>
          {body.map((r, i) => (
            <tr key={i} className="border-t border-secondary">
              {r.map((c, j) => <td key={j} className="px-3 py-2 align-top text-secondary">{inline(c)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Report({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-3">
      {blocks(markdown).map((b, i) => {
        if (b.kind === "table") return <Table key={i} lines={b.lines} />;
        if (b.kind === "h") return <h3 key={i} className="text-sm font-semibold text-primary">{inline(b.lines[0].replace(/^#+ /, ""))}</h3>;
        if (b.kind === "ul")
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 text-sm text-secondary">
              {b.lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*] /, ""))}</li>)}
            </ul>
          );
        return <p key={i} className="text-sm text-secondary">{inline(b.lines.join(" "))}</p>;
      })}
    </div>
  );
}
