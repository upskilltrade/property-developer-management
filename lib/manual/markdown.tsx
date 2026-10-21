import type { ReactNode } from "react";

/** **bold** inside a line; everything else is plain text (no HTML is ever injected). */
function inline(text: string, key: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${key}-${i}`} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

/**
 * Renders the manual's Markdown subset: ## / ### headings, - and 1. lists, > notes, | tables |
 * and paragraphs. Content is our own (lib/manual/content), never user input.
 */
export function ManualMarkdown({ source }: { source: string }) {
  const lines = source.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let n = 0;
  const k = () => `b${n++}`;
  while (i < lines.length) {
    const line = lines[i].trimEnd();
    const t = line.trim();
    if (!t) {
      i++;
      continue;
    }
    if (t.startsWith("### ")) {
      out.push(
        <h4 key={k()} className="mt-5 mb-1.5 text-[14px] font-semibold text-ink">
          {inline(t.slice(4), `h${n}`)}
        </h4>,
      );
      i++;
    } else if (t.startsWith("## ") || t.startsWith("# ")) {
      out.push(
        <h3
          key={k()}
          className="mt-7 mb-2 border-b border-line pb-1 text-[15px] font-semibold text-ink first:mt-0"
        >
          {inline(t.replace(/^#+\s/, ""), `h${n}`)}
        </h3>,
      );
      i++;
    } else if (t.startsWith(">")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">"))
        items.push(lines[i++].trim().replace(/^>\s?/, ""));
      out.push(
        <div
          key={k()}
          className="my-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900"
        >
          {items.map((x, j) => (
            <p key={j}>{inline(x, `q${n}-${j}`)}</p>
          ))}
        </div>,
      );
    } else if (/^[-*] /.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*] /.test(lines[i])) items.push(lines[i++].trim().slice(2));
      out.push(
        <ul key={k()} className="my-2 list-disc space-y-1 pl-5 text-[13px] text-ink-2">
          {items.map((x, j) => (
            <li key={j}>{inline(x, `u${n}-${j}`)}</li>
          ))}
        </ul>,
      );
    } else if (/^\d+\. /.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\. /.test(lines[i]))
        items.push(lines[i++].trim().replace(/^\d+\.\s/, ""));
      out.push(
        <ol key={k()} className="my-2 list-decimal space-y-1 pl-5 text-[13px] text-ink-2">
          {items.map((x, j) => (
            <li key={j}>{inline(x, `o${n}-${j}`)}</li>
          ))}
        </ol>,
      );
    } else if (t.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i++]
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
      }
      const [head, ...body] = rows;
      out.push(
        <div key={k()} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {head?.map((c, j) => (
                  <th
                    key={j}
                    className="border border-line bg-subtle px-2 py-1.5 text-left font-semibold"
                  >
                    {inline(c, `th${n}-${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, j) => (
                    <td key={j} className="border border-line px-2 py-1.5 align-top text-ink-2">
                      {inline(c, `td${n}-${ri}-${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#|>|[-*] |\d+\. |\|)/.test(lines[i].trim()))
        para.push(lines[i++].trim());
      out.push(
        <p key={k()} className="my-2 text-[13px] leading-relaxed text-ink-2">
          {inline(para.join(" "), `p${n}`)}
        </p>,
      );
    }
  }
  return <div>{out}</div>;
}
