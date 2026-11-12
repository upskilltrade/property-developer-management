import { describe, expect, it } from "vitest";
import { boqTotals, buildBoq, groupOptions, type BoqItem, type BoqUnit } from "@/lib/boq";

const units: BoqUnit[] = [
  { id: "u1", code: "UNIT-01", house_type_id: "villa" },
  { id: "u2", code: "UNIT-02", house_type_id: "villa" },
  { id: "u3", code: "UNIT-03", house_type_id: "villa" },
  { id: "u4", code: "UNIT-04", house_type_id: "other" },
];

let order = 0;
const item = (p: Partial<BoqItem> & { id: string }): BoqItem => ({
  cost_category_id: "HOUSE",
  parent_id: null,
  is_group: false,
  per_unit: false,
  house_type_id: null,
  unit_id: null,
  overrides_item_id: null,
  spec_item_id: null,
  item_code: null,
  description: p.id,
  uom: "LS",
  quantity: 0,
  rate: 0,
  amount: 0,
  sort_order: ++order,
  note: null,
  ...p,
});

const items: BoqItem[] = [
  item({ id: "house", is_group: true, description: "ตัวบ้าน" }),
  item({ id: "main", parent_id: "house", per_unit: true, quantity: 239, rate: 18000 }),
  item({
    id: "pool",
    parent_id: "house",
    per_unit: true,
    house_type_id: "villa",
    quantity: 37,
    rate: 16000,
  }),
  // UNIT-02 has a bigger pool; UNIT-03 has no pool.
  item({ id: "pool-u2", overrides_item_id: "pool", unit_id: "u2", quantity: 45, rate: 16000 }),
  item({ id: "pool-u3", overrides_item_id: "pool", unit_id: "u3", quantity: 0, rate: 16000 }),
  item({ id: "deck-u1", parent_id: "house", unit_id: "u1", quantity: 1, rate: 50000 }),
  item({ id: "detail", parent_id: "house", is_group: true }),
  item({ id: "steel", parent_id: "detail", quantity: 2, rate: 30000 }),
  item({ id: "road", cost_category_id: "INFRA", quantity: 504, rate: 650 }),
];

describe("buildBoq", () => {
  it("counts templates once per house, minus overrides", () => {
    const [house, infra] = buildBoq(items, units);
    const row = (id: string) => house.rows.find((r) => r.item.id === id)!;
    expect(row("main").houses).toBe(4);
    expect(row("main").total).toBe(239 * 18000 * 4);
    // Villa type only (3 houses): u1 standard, u2 override, u3 omitted.
    expect(row("pool").houses).toBe(1);
    expect(row("pool").overrides.map((o) => o.id)).toEqual(["pool-u2", "pool-u3"]);
    expect(row("pool").total).toBe(37 * 16000 + 45 * 16000);
    expect(row("detail").total).toBe(60000);
    expect(row("steel").depth).toBe(3);
    expect(row("house").total).toBe(239 * 18000 * 4 + 37 * 16000 + 45 * 16000 + 50000 + 60000);
    expect(house.total).toBe(row("house").total);
    expect(infra.total).toBe(327600);
  });

  it("one house sees its own share only", () => {
    const [house] = buildBoq(items, units, "u2");
    const ids = house.rows.map((r) => r.item.id);
    expect(ids).toEqual(["house", "main", "pool"]);
    expect(house.rows.find((r) => r.item.id === "pool")!.replacedBy?.id).toBe("pool-u2");
    expect(house.total).toBe(239 * 18000 + 45 * 16000);
    // Project-wide lines (road, the detail group) belong to no single house.
    expect(buildBoq(items, units, "u4").map((s) => s.cost_category_id)).toEqual(["HOUSE"]);
    expect(buildBoq(items, units, "u4")[0].total).toBe(239 * 18000);
  });

  it("totals per cost code and groups that can take children", () => {
    const totals = boqTotals(items, units);
    expect(totals.get("INFRA")).toBe(327600);
    expect(groupOptions(buildBoq(items, units)).map((g) => [g.id, g.depth])).toEqual([
      ["house", 1],
      ["detail", 2],
    ]);
  });
});
