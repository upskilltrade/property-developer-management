import { describe, expect, it } from "vitest";
import {
  cashflow,
  computeForecast,
  feasibility,
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
  unpricedUnits: 0,
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

describe("leasehold / split deals", () => {
  it("moves land-lease and construction parts out of the house-sale tax base", () => {
    const f = { ...facts, leaseRevenue: 4_000_000, constructionRevenue: 6_000_000 };
    const r = computeForecast(
      { ...plan, lease_tax_pct: 5, lease_fee_pct: 1, construction_tax_pct: 7 },
      lines,
      f,
    );
    const d = Object.fromEntries(r.derived.map((x) => [x.key, x.amount]));
    expect(r.houseRevenue).toBe(40_000_000);
    expect(d.TRANSFER).toBe(400_000); // 2% × 50% × 40M
    expect(d.BUSINESS_TAX).toBe(1_320_000); // 3.3% × 40M
    expect(d.LEASE_TAX).toBe(200_000);
    expect(d.LEASE_FEE).toBe(40_000);
    expect(d.CONSTRUCTION_TAX).toBe(420_000);
  });
  it("adds no lease rows for an all-freehold project and treats missing rates as zero", () => {
    expect(computeForecast(plan, lines, facts).derived.some((d) => d.key === "LEASE_TAX")).toBe(
      false,
    );
    const r = computeForecast(plan, lines, { ...facts, leaseRevenue: 1_000_000 });
    expect(r.derived.find((d) => d.key === "LEASE_TAX")!.amount).toBe(0);
  });
});

describe("units without a list price", () => {
  it("uses the revenue line's price per house for unsold units that have no price yet", () => {
    const f = { ...facts, unsoldListValue: 0, unpricedUnits: 7 };
    const rev = (rate: number) => computeForecast(plan, [{ ...lines[0], rate }], f).revenue;
    expect(rev(0)).toBe(15_000_000);
    expect(rev(5_000_000)).toBe(50_000_000);
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

describe("interest from the monthly shortfall", () => {
  const loan = { ...plan, loan_rate_pct: 12 };

  it("charges no interest without a loan rate", () => {
    const r = computeForecast(plan, lines, facts);
    expect(r.derived.some((d) => d.key === "INTEREST")).toBe(false);
    expect(r.interestByMonth.every((v) => v === 0)).toBe(true);
  });

  it("charges 1% a month on the shortfall and lowers profit by the same amount", () => {
    const base = computeForecast(plan, lines, facts);
    const r = computeForecast(loan, lines, facts);
    const total = r.derived.find((d) => d.key === "INTEREST")!.amount;
    expect(total).toBeGreaterThan(0);
    expect(r.profitBeforeTax).toBeCloseTo(base.profitBeforeTax - total, 1);
    // Month 1: land up front plus a month of spread costs, less a month of sales.
    const c0 = cashflow(plan, base).series[0].cumulative;
    expect(r.interestByMonth[0]).toBeCloseTo(-c0 * 0.01, 1);
  });

  it("own equity covers the first part of the shortfall", () => {
    const all = computeForecast(loan, lines, facts).interestByMonth[0];
    const part = computeForecast({ ...loan, equity_amount: 10_000_000 }, lines, facts)
      .interestByMonth[0];
    expect(part).toBeCloseTo(all - 100_000, 1);
    const none = computeForecast({ ...loan, equity_amount: 100_000_000 }, lines, facts);
    expect(none.derived.find((d) => d.key === "INTEREST")!.amount).toBe(0);
  });

  it("a slower sell-out costs more interest", () => {
    const at = (m: number) =>
      computeForecast({ ...loan, sell_out_months: m }, lines, facts).derived.find(
        (d) => d.key === "INTEREST",
      )!.amount;
    expect(at(20)).toBeGreaterThan(at(10));
  });

  it("the cash flow carries the same interest and still ends at net profit", () => {
    const r = computeForecast(loan, lines, facts);
    const c = cashflow(loan, r);
    expect(c.series.at(-1)!.cumulative).toBeCloseTo(r.netProfit, 0);
  });
});

describe("feasibility", () => {
  it("cost multiple, land share and before-tax margin from the plan", () => {
    const r = computeForecast(plan, lines, facts);
    const x = feasibility(plan, r, facts);
    const cost = 35_500_000 + 500_000 + 1_650_000;
    expect(x.checks.costMultiple.value).toBeCloseTo(50_000_000 / cost, 6);
    expect(x.checks.costMultiple.status).toBe("OK");
    expect(x.checks.landShare.value).toBeCloseTo(0.4, 6);
    expect(x.checks.landShare.status).toBe("WARN");
    expect(x.checks.marginBeforeTax.value).toBeCloseTo(r.profitBeforeTax / 50_000_000, 6);
  });

  it("sellable ratio needs the project land and the units' plot land", () => {
    const r = computeForecast(plan, lines, facts);
    expect(feasibility(plan, r, facts).checks.sellableRatio.status).toBe("MISSING");
    const x = feasibility({ ...plan, land_area_sqm: 8_000 }, r, { ...facts, totalPlotArea: 4_400 });
    expect(x.checks.sellableRatio.value).toBeCloseTo(0.55, 6);
    expect(x.checks.sellableRatio.status).toBe("WARN");
  });

  it("groups costs and flags shares outside the usual range", () => {
    const r = computeForecast(plan, lines, facts);
    const g = Object.fromEntries(feasibility(plan, r, facts).groups.map((x) => [x.key, x]));
    expect(g.LAND.amount).toBe(20_000_000);
    expect(g.LAND.status).toBe("HIGH");
    expect(g.CONSTRUCTION.share).toBeCloseTo(0.27, 6);
    expect(g.CONSTRUCTION.status).toBe("LOW");
    expect(g.TRANSFER_TAX.amount).toBe(2_150_000);
    expect(g.SALES.amount).toBe(1_000_000);
    const a = computeForecast(plan, lines, facts, "AGENT");
    const ga = Object.fromEntries(feasibility(plan, a, facts).groups.map((x) => [x.key, x]));
    expect(ga.SALES.amount).toBe(1_500_000); // marketing dropped, commission added
  });
});

function round2(v: number) {
  return Math.round(v * 100) / 100;
}
