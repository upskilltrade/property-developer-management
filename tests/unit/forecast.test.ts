import { describe, expect, it } from "vitest";
import {
  cashflow,
  computeForecast,
  type ForecastFacts,
  type ForecastLine,
  type ForecastPlan,
} from "@/lib/forecast";

const plan: ForecastPlan = {
  start_month: "2026-11-01",
  sell_out_months: 10,
  sales_mode: "SELF",
  agent_commission_pct: 3,
  target_margin_pct: 15,
  transfer_fee_pct: 2,
  developer_transfer_share_pct: 50,
  business_tax_pct: 3.3,
  income_tax_pct: 20,
  notes: null,
};
const line = (o: Partial<ForecastLine>): ForecastLine => ({
  id: Math.random().toString(),
  kind: "COST",
  category: "OTHER",
  label: "x",
  method: "LUMP",
  amount: 0,
  rate: 0,
  quantity: 0,
  pct: 0,
  timing: "SPREAD",
  cost_category_id: null,
  self_sales_only: false,
  ...o,
});
const facts: ForecastFacts = {
  units: 10,
  soldValue: 15_000_000,
  soldUnits: 3,
  unsoldListValue: 35_000_000,
  collected: 2_000_000,
  totalFloorArea: 1500,
  actualByCategory: new Map([["cat-land", { actual: 6_000_000, committed: 0 }]]),
};
const lines: ForecastLine[] = [
  line({
    kind: "REVENUE",
    category: "SALES_HOUSES",
    method: "UNITS_FROM_SYSTEM",
    timing: "WITH_SALES",
  }),
  line({ category: "LAND", amount: 20_000_000, timing: "START", cost_category_id: "cat-land" }),
  line({
    category: "CONSTRUCTION",
    method: "PER_SQM",
    rate: 9_000,
    quantity: 1500,
    timing: "WITH_SALES",
  }),
  line({ category: "MARKETING", amount: 1_000_000, self_sales_only: true }),
  line({ category: "CONTINGENCY", method: "PCT_REVENUE", pct: 2 }),
];

describe("computeForecast", () => {
  const r = computeForecast(plan, lines, facts);

  it("revenue from the system: sold agreed prices plus unsold list prices", () => {
    expect(r.revenue).toBe(50_000_000);
    expect(r.sold.remainingToSell).toBe(35_000_000);
  });

  it("line values by method", () => {
    expect(r.lines.map((l) => l.forecast)).toEqual([
      50_000_000, 20_000_000, 13_500_000, 1_000_000, 1_000_000,
    ]);
    expect(r.costs).toBe(35_500_000);
  });

  it("transfer share, business tax and income tax from the owner's rates", () => {
    const d = Object.fromEntries(r.derived.map((x) => [x.key, x.amount]));
    expect(d.TRANSFER).toBe(500_000); // 2% × 50% × 50M
    expect(d.BUSINESS_TAX).toBe(1_650_000); // 3.3% × 50M
    expect(r.profitBeforeTax).toBe(50_000_000 - 35_500_000 - 500_000 - 1_650_000);
    expect(d.INCOME_TAX).toBe(round2(r.profitBeforeTax * 0.2));
    expect(r.netProfit).toBe(round2(r.profitBeforeTax - d.INCOME_TAX));
  });

  it("actual vs forecast where a cost category is linked", () => {
    const land = r.lines.find((l) => l.category === "LAND")!;
    expect(land.actual).toBe(6_000_000);
    expect(land.remaining).toBe(14_000_000);
    expect(r.lines.find((l) => l.category === "MARKETING")!.actual).toBeNull();
  });

  it("headroom per unit keeps the target margin, grossed up for income tax", () => {
    const keep = r.netProfit - 0.15 * r.revenue;
    expect(r.headroomPerUnit).toBe(round2(keep / 0.8 / 10));
  });

  it("sole agent: drops in-house sales costs and adds commission", () => {
    const a = computeForecast(plan, lines, facts, "AGENT");
    expect(a.lines.find((l) => l.category === "MARKETING")!.excluded).toBe(true);
    expect(a.costs).toBe(34_500_000);
    expect(a.derived.find((d) => d.key === "AGENT")!.amount).toBe(1_500_000);
  });

  it("empty rates mean no tax is assumed", () => {
    const blank = computeForecast(
      {
        ...plan,
        transfer_fee_pct: null,
        business_tax_pct: null,
        income_tax_pct: null,
        target_margin_pct: null,
      },
      lines,
      facts,
    );
    expect(blank.derived.every((d) => d.amount === 0)).toBe(true);
    expect(blank.headroomPerUnit).toBeNull();
  });
});

describe("cashflow", () => {
  it("places START in the first month, spreads the rest, and finds the lowest point", () => {
    const r = computeForecast(plan, lines, facts);
    const c = cashflow(plan, r);
    expect(c.series).toHaveLength(10);
    expect(c.series[0].month).toBe("2026-11");
    expect(c.endMonth).toBe("2027-08");
    expect(c.series[0].outflow).toBeGreaterThan(20_000_000);
    expect(c.lowest.month).toBe("2026-11");
    expect(c.series.at(-1)!.cumulative).toBeCloseTo(r.netProfit, 0);
  });
});

function round2(v: number) {
  return Math.round(v * 100) / 100;
}
