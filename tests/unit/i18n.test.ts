import { describe, expect, it } from "vitest";
import th from "@/lib/i18n/dictionaries/th";
import en from "@/lib/i18n/dictionaries/en";

type Node = string | Node[] | { [k: string]: Node };

function walk(a: Node, b: Node, path: string, problems: string[]) {
  if (typeof a === "string" || typeof b === "string") {
    if (typeof a !== typeof b) problems.push(`${path}: type differs`);
    else if (!(a as string).trim() || !(b as string).trim()) problems.push(`${path}: empty text`);
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      problems.push(`${path}: list length differs`);
    else a.forEach((x, i) => walk(x, b[i], `${path}[${i}]`, problems));
    return;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (!(k in a) || !(k in b)) problems.push(`${path}.${k}: missing in ${k in a ? "en" : "th"}`);
    else walk(a[k], b[k], `${path}.${k}`, problems);
  }
}

describe("dictionaries", () => {
  it("Thai and English have the same keys, list lengths and no empty text", () => {
    const problems: string[] = [];
    walk(th as unknown as Node, en as unknown as Node, "", problems);
    expect(problems).toEqual([]);
  });
});
