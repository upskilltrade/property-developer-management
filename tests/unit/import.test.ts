import { describe, expect, it } from "vitest";
import { importColumns, importKinds, rowsFromCsv } from "@/lib/import";

describe("rowsFromCsv", () => {
  it("maps rows by header, case-insensitively, and trims values", () => {
    const { rows, missing, unknown } = rowsFromCsv("UNITS", [
      ["Unit_Code", " list_price "],
      [" U-01 ", "4,500,000"],
      ["U-02"],
    ]);
    expect(missing).toEqual([]);
    expect(unknown).toEqual([]);
    expect(rows).toEqual([
      { unit_code: "U-01", list_price: "4,500,000" },
      { unit_code: "U-02", list_price: "" },
    ]);
  });

  it("reports missing required and unknown columns", () => {
    const { missing, unknown } = rowsFromCsv("PAYMENTS", [["unit_code", "amount", "foo"]]);
    expect(missing).toEqual(["sequence", "paid_on"]);
    expect(unknown).toEqual(["foo"]);
  });

  it("never passes columns outside the template to the database", () => {
    const { rows } = rowsFromCsv("SALES", [
      ["unit_code", "customer_name", "status", "agreed_price", "extra"],
      ["U-01", "A", "RESERVED", "1", "x"],
    ]);
    expect(Object.keys(rows[0])).not.toContain("extra");
  });

  it("every template starts with unit_code", () => {
    for (const k of importKinds)
      expect(importColumns[k][0]).toEqual({ key: "unit_code", required: true });
  });
});
