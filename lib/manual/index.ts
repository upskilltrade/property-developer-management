import type { ManualSection } from "./types";
import { sections as basics } from "./content/a-basics";
import { sections as sales } from "./content/b-sales";
import { sections as construction } from "./content/c-construction";
import { sections as finance } from "./content/d-finance";

export type { ManualSection };

/** Every chapter in reading order. */
export const manual: ManualSection[] = [...basics, ...sales, ...construction, ...finance];

/** Chapters for a user: owners see everything; others see general chapters and their roles'. */
export function manualFor(roles: Set<string>) {
  if (roles.has("OWNER")) return manual;
  return manual.filter((s) => !s.roles.length || s.roles.some((r) => roles.has(r)));
}

/** Chapters grouped for the table of contents, keeping first-seen group order. */
export function groupManual(sections: ManualSection[]) {
  const groups = new Map<string, ManualSection[]>();
  for (const s of sections) groups.set(s.group, [...(groups.get(s.group) ?? []), s]);
  return [...groups.entries()].map(([group, items]) => ({ group, items }));
}
