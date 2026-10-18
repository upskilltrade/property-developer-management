import { describe, expect, it } from "vitest";
import { monthRange } from "@/lib/monthly-report";

describe("monthRange", () => {
  it("gives the month's first and last day and its neighbours", () => {
    expect(monthRange("2026-02")).toEqual({
      month: "2026-02",
      from: "2026-02-01",
      to: "2026-02-28",
      toExclusive: "2026-03-01",
      prev: "2026-01",
      next: "2026-03",
    });
  });

  it("handles leap years and year boundaries", () => {
    expect(monthRange("2028-02").to).toBe("2028-02-29");
    expect(monthRange("2026-12")).toMatchObject({
      to: "2026-12-31",
      toExclusive: "2027-01-01",
      next: "2027-01",
    });
    expect(monthRange("2027-01").prev).toBe("2026-12");
  });

  it("falls back to the current month for bad input", () => {
    expect(monthRange("not-a-month").month).toBe(new Date().toISOString().slice(0, 7));
  });
});
