/** BOQ in levels: pure helpers so the tree and its totals can be unit tested. */

export type BoqItem = {
  id: string;
  cost_category_id: string;
  parent_id: string | null;
  is_group: boolean;
  per_unit: boolean;
  house_type_id: string | null;
  unit_id: string | null;
  overrides_item_id: string | null;
  spec_item_id: string | null;
  item_code: string | null;
  description: string;
  uom: string;
  quantity: number;
  rate: number;
  amount: number;
  sort_order: number;
  note: string | null;
};

export type BoqUnit = { id: string; code: string; house_type_id: string | null };

export type BoqRow = {
  item: BoqItem;
  /** 1 = directly under the cost code. */
  depth: number;
  /** What the row costs in this view (templates × houses, groups = sum of what is under them). */
  total: number;
  /** Houses a template line is counted for in this view (null for other lines). */
  houses: number | null;
  /** Per-house overrides of a template line (project view only). */
  overrides: BoqItem[];
  /** In a one-house view: the override that replaced this template line. */
  replacedBy: BoqItem | null;
};

export type BoqSection = { cost_category_id: string; total: number; rows: BoqRow[] };

const n = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};
const round = (v: number) => Math.round(v * 100) / 100;
const lineAmount = (i: BoqItem) => (i.is_group ? 0 : round(n(i.quantity) * n(i.rate)));

/** Houses a template line applies to (all, or those of its house type). */
export function templateUnits(item: BoqItem, units: BoqUnit[]) {
  return units.filter((u) => !item.house_type_id || u.house_type_id === item.house_type_id);
}

/**
 * The BOQ as sections per cost code, each a depth-first list of rows.
 * Without `unitId` it is the whole project; with it, only what that house costs: its template
 * lines (or its override of them) and its own lines, never project-wide lines.
 */
export function buildBoq(items: BoqItem[], units: BoqUnit[], unitId?: string | null): BoqSection[] {
  const live = items;
  const unitIds = new Set(units.map((u) => u.id));
  const overridesOf = new Map<string, BoqItem[]>();
  for (const i of live)
    if (i.overrides_item_id && i.unit_id && unitIds.has(i.unit_id)) {
      const list = overridesOf.get(i.overrides_item_id) ?? [];
      list.push(i);
      overridesOf.set(i.overrides_item_id, list);
    }
  const children = new Map<string | null, BoqItem[]>();
  for (const i of live) {
    if (i.overrides_item_id) continue; // shown with the template they override
    const key = i.parent_id && live.some((p) => p.id === i.parent_id) ? i.parent_id : null;
    const list = children.get(key) ?? [];
    list.push(i);
    children.set(key, list);
  }
  for (const list of children.values())
    list.sort((a, b) => a.sort_order - b.sort_order || a.description.localeCompare(b.description));

  const rowsFor = (item: BoqItem, depth: number, out: BoqRow[]): number => {
    if (item.is_group) {
      const row: BoqRow = { item, depth, total: 0, houses: null, overrides: [], replacedBy: null };
      out.push(row);
      let total = 0;
      for (const c of children.get(item.id) ?? []) total += rowsFor(c, depth + 1, out);
      row.total = round(total);
      if (unitId && !row.total && !hasContent(item.id)) out.splice(out.indexOf(row), 1);
      return row.total;
    }
    const own = overridesOf.get(item.id) ?? [];
    if (item.per_unit) {
      const applies = templateUnits(item, units);
      if (unitId) {
        if (!applies.some((u) => u.id === unitId)) return 0;
        const replacedBy = own.find((o) => o.unit_id === unitId) ?? null;
        const total = replacedBy ? lineAmount(replacedBy) : lineAmount(item);
        out.push({ item, depth, total, houses: 1, overrides: [], replacedBy });
        return total;
      }
      const overridden = own.filter((o) => applies.some((u) => u.id === o.unit_id));
      const houses = applies.length - overridden.length;
      const total = round(
        lineAmount(item) * houses + overridden.reduce((a, o) => a + lineAmount(o), 0),
      );
      out.push({ item, depth, total, houses, overrides: overridden, replacedBy: null });
      return total;
    }
    if (unitId && item.unit_id !== unitId) return 0;
    const total = lineAmount(item);
    out.push({ item, depth, total, houses: null, overrides: [], replacedBy: null });
    return total;
  };
  // Whether a group holds anything for the house being viewed.
  const hasContent = (groupId: string): boolean =>
    (children.get(groupId) ?? []).some((c) =>
      c.is_group
        ? hasContent(c.id)
        : c.per_unit
          ? templateUnits(c, units).some((u) => u.id === unitId)
          : c.unit_id === unitId,
    );

  const sections = new Map<string, BoqSection>();
  for (const top of children.get(null) ?? []) {
    const s = sections.get(top.cost_category_id) ?? {
      cost_category_id: top.cost_category_id,
      total: 0,
      rows: [],
    };
    s.total = round(s.total + rowsFor(top, 1, s.rows));
    sections.set(top.cost_category_id, s);
  }
  return [...sections.values()].filter((s) => s.rows.length);
}

/** Total per cost code (same rule as the database's boq_effective). */
export function boqTotals(items: BoqItem[], units: BoqUnit[]) {
  return new Map(buildBoq(items, units).map((s) => [s.cost_category_id, s.total]));
}

/** Groups a new line can go under: every group not yet at the deepest level (4). */
export function groupOptions(sections: BoqSection[]) {
  return sections.flatMap((s) =>
    s.rows
      .filter((r) => r.item.is_group && r.depth < 4)
      .map((r) => ({
        id: r.item.id,
        depth: r.depth,
        label: r.item.description,
        cost_category_id: s.cost_category_id,
      })),
  );
}
