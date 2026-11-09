import { describe, expect, it } from "vitest";
import {
  changedFields,
  groupByCategory,
  lineAmount,
  photoRequired,
  photosByTarget,
  specErrorKey,
  specTotals,
  type SpecLine,
} from "@/lib/spec";

const line = (over: Partial<SpecLine>): SpecLine => ({
  line_id: null,
  base_item_id: "b",
  option_id: null,
  option_name: null,
  kind: "STANDARD",
  status: null,
  editable: false,
  variation_order_id: null,
  vo_no: null,
  vo_status: null,
  item_no: "X-01",
  seq: 10,
  category: "FLOOR",
  area: null,
  name: "Item",
  description: null,
  brand: null,
  model: null,
  color: null,
  size: null,
  supplier: null,
  quantity: null,
  unit: null,
  unit_price: null,
  amount: null,
  std_brand: null,
  std_model: null,
  std_color: null,
  std_size: null,
  std_supplier: null,
  std_quantity: null,
  std_unit_price: null,
  std_amount: null,
  cost_delta: 0,
  charge: 0,
  note: null,
  ...over,
});

describe("spec list", () => {
  it("amount is quantity x unit price, null when either is missing", () => {
    expect(lineAmount("100", "650")).toBe(65000);
    expect(lineAmount(2.5, 33.333)).toBe(83.33);
    expect(lineAmount(null, 650)).toBeNull();
    expect(lineAmount(3, "")).toBeNull();
  });

  it("groups by category in print order", () => {
    const groups = groupByCategory([
      { category: "POOL" },
      { category: "ROOF" },
      { category: "POOL" },
      { category: "WEIRD" },
    ]);
    expect(groups.map((g) => [g.category, g.items.length])).toEqual([
      ["ROOF", 1],
      ["POOL", 2],
      ["WEIRD", 1],
    ]);
  });

  it("totals standard, changes, charges and drafts", () => {
    const t = specTotals([
      line({ amount: 65000, std_amount: 65000 }),
      line({
        kind: "CHANGE",
        amount: 80000,
        std_amount: 65000,
        cost_delta: 15000,
        charge: 20000,
        editable: true,
      }),
      line({ kind: "OMIT", amount: 0, std_amount: 12000, cost_delta: -12000, charge: -12000 }),
      line({
        kind: "ADD",
        base_item_id: null,
        amount: 30000,
        cost_delta: 30000,
        charge: 35000,
        editable: true,
      }),
      line({ amount: null, std_amount: null }),
    ]);
    expect(t).toEqual({
      standard: 142000,
      current: 175000,
      costDelta: 33000,
      charge: 43000,
      draftCharge: 55000,
      changes: 3,
      drafts: 2,
      unpriced: 1,
    });
  });

  it("lists what a change replaced", () => {
    const l = line({
      kind: "CHANGE",
      brand: "SCG",
      std_brand: "SCG",
      color: "Walnut",
      std_color: "Oak",
    });
    expect(changedFields(l)).toEqual([{ field: "color", was: "Oak" }]);
    expect(changedFields(line({ color: "x", std_color: "y" }))).toEqual([]);
  });

  it("maps RPC errors to flash keys", () => {
    expect(specErrorKey("Not authorized")).toBe("permission");
    expect(specErrorKey("Spec line locked")).toBe("specLocked");
    expect(specErrorKey("Spec price missing")).toBe("specPrice");
    expect(
      specErrorKey(
        'duplicate key value violates unique constraint "spec_items_project_id_item_no_key"',
      ),
    ).toBe("specDuplicate");
    expect(specErrorKey("Invalid spec")).toBe("invalid");
    expect(specErrorKey(undefined)).toBe("error");
  });

  it("knows which categories need photos and groups photos by target", () => {
    expect(photoRequired("SANITARY")).toBe(true);
    expect(photoRequired("STRUCTURE")).toBe(false);
    const m = photosByTarget([
      { item_id: "i", option_id: null, line_id: null },
      { item_id: "i", option_id: null, line_id: null },
      { item_id: null, option_id: "o", line_id: null },
    ]);
    expect(m.get("i")?.length).toBe(2);
    expect(m.get("o")?.length).toBe(1);
  });
});
