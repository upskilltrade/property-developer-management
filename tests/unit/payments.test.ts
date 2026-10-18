import { describe, expect, it } from "vitest";
import { defaultSchedule } from "@/lib/payments";

const sum = (xs: { amount: number }[]) =>
  Math.round(xs.reduce((a, x) => a + x.amount, 0) * 100) / 100;

describe("defaultSchedule", () => {
  it("always adds up to the price", () => {
    for (const price of [5_000_000, 3_333_333.33, 1_234_567, 49_999]) {
      const items = defaultSchedule({ price, start: "2026-10-01", transfer: "2027-06-01" });
      expect(sum(items)).toBe(price);
      expect(items.every((i) => i.amount > 0)).toBe(true);
    }
  });

  it("orders booking, contract, installments, transfer", () => {
    const items = defaultSchedule({
      price: 5_000_000,
      start: "2026-10-01",
      transfer: "2027-06-01",
    });
    expect(items.map((i) => i.kind)).toEqual([
      "BOOKING",
      "CONTRACT",
      "INSTALLMENT",
      "INSTALLMENT",
      "INSTALLMENT",
      "INSTALLMENT",
      "INSTALLMENT",
      "TRANSFER",
    ]);
    expect(items[0]).toMatchObject({ amount: 50_000, due_date: "2026-10-01" });
    expect(items[1]).toMatchObject({ amount: 450_000, due_date: "2026-11-01" });
    expect(items.at(-1)).toMatchObject({ amount: 3_750_000, due_date: "2027-06-01" });
  });

  it("caps the booking at the price and returns nothing without a price", () => {
    expect(
      defaultSchedule({ price: 30_000, start: "2026-10-01", transfer: "2027-01-01" })[0].amount,
    ).toBe(30_000);
    expect(defaultSchedule({ price: 0, start: "2026-10-01", transfer: "2027-01-01" })).toEqual([]);
  });

  it("adds month offsets in UTC across year ends", () => {
    const items = defaultSchedule({
      price: 1_000_000,
      start: "2026-12-15",
      transfer: "2027-12-01",
    });
    expect(items[1].due_date).toBe("2027-01-15");
  });
});
