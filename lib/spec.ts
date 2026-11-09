import type { Tone } from "@/lib/status";

/** Spec list categories, in the order the list is printed. */
export const specCategories = [
  "STRUCTURE",
  "ROOF",
  "WALL",
  "FLOOR",
  "CEILING",
  "DOOR_WINDOW",
  "SANITARY",
  "KITCHEN",
  "ELECTRICAL",
  "LIGHTING",
  "PLUMBING",
  "AIRCON",
  "POOL",
  "EXTERIOR",
  "FURNITURE",
  "OTHER",
] as const;
export type SpecCategory = (typeof specCategories)[number];

export const specKindTone: Record<string, Tone> = {
  STANDARD: "neutral",
  CHANGE: "accent",
  ADD: "success",
  OMIT: "danger",
};

/** One row of unit_spec_lines(): a standard item as this unit has it, or an item it adds. */
export type SpecLine = {
  line_id: string | null;
  base_item_id: string | null;
  option_id: string | null;
  option_name: string | null;
  kind: "STANDARD" | "CHANGE" | "ADD" | "OMIT";
  status: "DRAFT" | "IN_VO" | null;
  editable: boolean;
  variation_order_id: string | null;
  vo_no: string | null;
  vo_status: string | null;
  item_no: string;
  seq: number;
  category: string;
  area: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  size: string | null;
  supplier: string | null;
  quantity: number | string | null;
  unit: string | null;
  unit_price: number | string | null;
  amount: number | string | null;
  std_brand: string | null;
  std_model: string | null;
  std_color: string | null;
  std_size: string | null;
  std_supplier: string | null;
  std_quantity: number | string | null;
  std_unit_price: number | string | null;
  std_amount: number | string | null;
  cost_delta: number | string | null;
  charge: number | string | null;
  note: string | null;
};

const n = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? null : Number(v);

/** quantity x unit price, rounded to satang; null when either is missing. */
export function lineAmount(quantity: number | string | null, unitPrice: number | string | null) {
  const q = n(quantity);
  const p = n(unitPrice);
  return q === null || p === null ? null : Math.round(q * p * 100) / 100;
}

/** Groups rows by category in specCategories order; unknown categories go last. */
export function groupByCategory<T extends { category: string }>(rows: T[]) {
  const order = new Map<string, number>(specCategories.map((c, i) => [c, i]));
  const groups = new Map<string, T[]>();
  for (const r of rows) groups.set(r.category, [...(groups.get(r.category) ?? []), r]);
  return [...groups.entries()]
    .sort(([a], [b]) => (order.get(a) ?? 99) - (order.get(b) ?? 99))
    .map(([category, items]) => ({ category, items }));
}

export type SpecTotals = {
  /** Standard amount of every standard item that applies (whether or not the unit changed it). */
  standard: number;
  /** What this unit's spec costs after its changes. */
  current: number;
  /** Sum of cost differences of all changes. */
  costDelta: number;
  /** Sum of buyer charges of all changes (negative = credit). */
  charge: number;
  /** Buyer charge of changes not yet in a VO. */
  draftCharge: number;
  changes: number;
  drafts: number;
  /** Rows with no quantity or unit price, so totals leave them out. */
  unpriced: number;
};

export function specTotals(lines: SpecLine[]): SpecTotals {
  const t: SpecTotals = {
    standard: 0,
    current: 0,
    costDelta: 0,
    charge: 0,
    draftCharge: 0,
    changes: 0,
    drafts: 0,
    unpriced: 0,
  };
  for (const l of lines) {
    if (l.kind !== "ADD") t.standard += n(l.std_amount) ?? 0;
    const amount = n(l.amount);
    if (amount === null) t.unpriced++;
    t.current += amount ?? 0;
    if (l.kind === "STANDARD") continue;
    t.changes++;
    t.costDelta += n(l.cost_delta) ?? 0;
    t.charge += n(l.charge) ?? 0;
    if (l.editable) {
      t.drafts++;
      t.draftCharge += n(l.charge) ?? 0;
    }
  }
  const r = (x: number) => Math.round(x * 100) / 100;
  return {
    ...t,
    standard: r(t.standard),
    current: r(t.current),
    costDelta: r(t.costDelta),
    charge: r(t.charge),
    draftCharge: r(t.draftCharge),
  };
}

/** Fields that differ from the standard, for showing "was" under a changed line. */
export function changedFields(l: SpecLine) {
  if (l.kind !== "CHANGE") return [];
  const pairs: [string, string | null, string | null][] = [
    ["brand", l.std_brand, l.brand],
    ["model", l.std_model, l.model],
    ["color", l.std_color, l.color],
    ["size", l.std_size, l.size],
    ["supplier", l.std_supplier, l.supplier],
  ];
  return pairs
    .filter(([, a, b]) => (a ?? "") !== (b ?? ""))
    .map(([field, was]) => ({ field, was }));
}

/** Maps spec RPC exceptions to flash keys. */
export function specErrorKey(message: string | undefined) {
  if (!message) return "error";
  if (message.includes("Not authorized")) return "permission";
  if (message.includes("locked")) return "specLocked";
  if (message.includes("price missing")) return "specPrice";
  if (message.includes("duplicate key")) return "specDuplicate";
  if (/Invalid|required/.test(message)) return "invalid";
  return "error";
}

/** Categories where buyers choose by look, so every standard item should carry a photo. */
export const photoRequiredCategories: readonly SpecCategory[] = [
  "ROOF",
  "WALL",
  "FLOOR",
  "CEILING",
  "DOOR_WINDOW",
  "SANITARY",
  "KITCHEN",
  "LIGHTING",
  "AIRCON",
  "POOL",
  "EXTERIOR",
  "FURNITURE",
];

export function photoRequired(category: string) {
  return (photoRequiredCategories as readonly string[]).includes(category);
}

/** Groups photo rows by the item, option or unit line they belong to. */
export function photosByTarget<
  T extends { item_id: string | null; option_id: string | null; line_id: string | null },
>(photos: T[]) {
  const map = new Map<string, T[]>();
  for (const p of photos) {
    const key = p.item_id ?? p.option_id ?? p.line_id;
    if (key) map.set(key, [...(map.get(key) ?? []), p]);
  }
  return map;
}
