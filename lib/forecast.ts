/** Project financial plan maths: pure functions so the numbers can be unit tested. */

export const forecastCostCategories = [
  "LAND",
  "PERMITS",
  "DESIGN",
  "SITE_PREP",
  "INFRASTRUCTURE",
  "COMMON_AREA",
  "CONSTRUCTION",
  "SHOWHOUSE",
  "MARKETING",
  "SALES_TEAM",
  "PROMOTIONS",
  "UTILITY_GUARANTEE",
  "JURISTIC_FUND",
  "WARRANTY_RESERVE",
  "HOLDING",
  "FINANCE",
  "ADMIN",
  "CONTINGENCY",
  "OTHER",
] as const;
export const forecastRevenueCategories = ["SALES_HOUSES", "OTHER_REVENUE"] as const;
export const forecastMethods = [
  "LUMP",
  "PER_SQM",
  "PER_UNIT",
  "PCT_REVENUE",
  "UNITS_FROM_SYSTEM",
] as const;
export const forecastTimings = ["START", "SPREAD", "WITH_SALES", "END"] as const;

export type ForecastPlan = {
  start_month: string;
  sell_out_months: number;
  sales_mode: "SELF" | "AGENT";
  agent_commission_pct: number | null;
  target_margin_pct: number | null;
  transfer_fee_pct: number | null;
  developer_transfer_share_pct: number | null;
  business_tax_pct: number | null;
  income_tax_pct: number | null;
  notes: string | null;
};

export type ForecastLine = {
  id: string;
  kind: "REVENUE" | "COST";
  category: string;
  label: string;
  method: (typeof forecastMethods)[number];
  amount: number;
  rate: number;
  quantity: number;
  pct: number;
  timing: (typeof forecastTimings)[number];
  cost_category_id: string | null;
  self_sales_only: boolean;
};

/** What the system already knows about the project. */
export type ForecastFacts = {
  units: number;
  /** Agreed prices of units already sold (reserved, contracted, sold, transferred). */
  soldValue: number;
  soldUnits: number;
  /** List prices of units not yet sold. */
  unsoldListValue: number;
  /** Unsold units with no list price yet; the revenue line's rate stands in for them. */
  unpricedUnits: number;
  collected: number;
  totalFloorArea: number;
  /** Spending recorded against each cost category (posted payments / commitments). */
  actualByCategory: Map<string, { actual: number; committed: number }>;
};

const n = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};
const pct = (v: number | null | undefined) => n(v) / 100;
const round = (v: number) => Math.round(v * 100) / 100;

export type ComputedLine = ForecastLine & {
  forecast: number;
  actual: number | null;
  committed: number | null;
  remaining: number | null;
  excluded: boolean;
};

export type DerivedCost = {
  key: "AGENT" | "TRANSFER" | "BUSINESS_TAX" | "INCOME_TAX";
  amount: number;
};

export type ForecastResult = {
  revenue: number;
  houseRevenue: number;
  lines: ComputedLine[];
  costs: number;
  derived: DerivedCost[];
  profitBeforeTax: number;
  incomeTax: number;
  netProfit: number;
  margin: number;
  /** Extra money per unit that could still go to giveaways or spec while keeping the target margin. */
  headroomPerUnit: number | null;
  sold: { value: number; units: number; collected: number; remainingToSell: number };
  spent: { actual: number; committed: number };
};

/** One scenario of the plan (the plan's own sales mode unless overridden). */
export function computeForecast(
  plan: ForecastPlan,
  lines: ForecastLine[],
  facts: ForecastFacts,
  mode: "SELF" | "AGENT" = plan.sales_mode,
): ForecastResult {
  const value = (l: ForecastLine, revenue: number) => {
    switch (l.method) {
      case "UNITS_FROM_SYSTEM":
        return facts.soldValue + facts.unsoldListValue + n(l.rate) * facts.unpricedUnits;
      case "PER_SQM":
      case "PER_UNIT":
        return n(l.rate) * n(l.quantity);
      case "PCT_REVENUE":
        return pct(l.pct) * revenue;
      default:
        return n(l.amount);
    }
  };
  const revenueLines = lines.filter((l) => l.kind === "REVENUE");
  const revenue = revenueLines.reduce((a, l) => a + value(l, 0), 0);
  const houseRevenue = revenueLines
    .filter((l) => l.category === "SALES_HOUSES")
    .reduce((a, l) => a + value(l, 0), 0);

  const computed: ComputedLine[] = lines.map((l) => {
    const excluded = l.kind === "COST" && mode === "AGENT" && l.self_sales_only;
    const forecast = round(value(l, revenue));
    const act = l.cost_category_id ? facts.actualByCategory.get(l.cost_category_id) : undefined;
    return {
      ...l,
      forecast,
      excluded,
      actual: act ? act.actual : null,
      committed: act ? act.committed : null,
      remaining: act ? round(forecast - act.actual) : null,
    };
  });
  const costs = computed
    .filter((l) => l.kind === "COST" && !l.excluded)
    .reduce((a, l) => a + l.forecast, 0);

  const derived: DerivedCost[] = [];
  if (mode === "AGENT")
    derived.push({ key: "AGENT", amount: round(pct(plan.agent_commission_pct) * revenue) });
  derived.push({
    key: "TRANSFER",
    amount: round(
      pct(plan.transfer_fee_pct) * pct(plan.developer_transfer_share_pct) * houseRevenue,
    ),
  });
  derived.push({ key: "BUSINESS_TAX", amount: round(pct(plan.business_tax_pct) * houseRevenue) });
  const beforeTax = round(revenue - costs - derived.reduce((a, d) => a + d.amount, 0));
  const incomeTax = round(Math.max(0, beforeTax) * pct(plan.income_tax_pct));
  derived.push({ key: "INCOME_TAX", amount: incomeTax });
  const net = round(beforeTax - incomeTax);

  // Each baht spent before tax lowers net profit by (1 - tax rate).
  let headroomPerUnit: number | null = null;
  if (plan.target_margin_pct != null && facts.units > 0 && revenue > 0) {
    const keep = net - pct(plan.target_margin_pct) * revenue;
    headroomPerUnit = round(keep / (1 - pct(plan.income_tax_pct) || 1) / facts.units);
  }

  const spent = computed
    .filter((l) => l.kind === "COST")
    .reduce(
      (a, l) => ({ actual: a.actual + n(l.actual), committed: a.committed + n(l.committed) }),
      {
        actual: 0,
        committed: 0,
      },
    );

  return {
    revenue: round(revenue),
    houseRevenue: round(houseRevenue),
    lines: computed,
    costs: round(costs),
    derived,
    profitBeforeTax: beforeTax,
    incomeTax,
    netProfit: net,
    margin: revenue ? net / revenue : 0,
    headroomPerUnit,
    sold: {
      value: facts.soldValue,
      units: facts.soldUnits,
      collected: facts.collected,
      remainingToSell: round(revenue - facts.soldValue),
    },
    spent,
  };
}

export type CashMonth = {
  month: string;
  inflow: number;
  outflow: number;
  net: number;
  cumulative: number;
};

/** Spreads the forecast over the sell-out period by each line's timing. */
export function cashflow(plan: ForecastPlan, result: ForecastResult) {
  const months = Math.max(1, Math.round(n(plan.sell_out_months)));
  const inflow = new Array<number>(months).fill(0);
  const outflow = new Array<number>(months).fill(0);
  const place = (arr: number[], amount: number, timing: ForecastLine["timing"]) => {
    if (!amount) return;
    if (timing === "START") arr[0] += amount;
    else if (timing === "END") arr[months - 1] += amount;
    else for (let i = 0; i < months; i++) arr[i] += amount / months;
  };
  for (const l of result.lines) {
    if (l.excluded) continue;
    place(l.kind === "REVENUE" ? inflow : outflow, l.forecast, l.timing);
  }
  for (const d of result.derived)
    place(outflow, d.amount, d.key === "INCOME_TAX" ? "END" : "WITH_SALES");

  const start = new Date(`${plan.start_month.slice(0, 7)}-01T00:00:00Z`);
  let cumulative = 0;
  const series: CashMonth[] = inflow.map((inc, i) => {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const net = inc - outflow[i];
    cumulative += net;
    return {
      month: d.toISOString().slice(0, 7),
      inflow: round(inc),
      outflow: round(outflow[i]),
      net: round(net),
      cumulative: round(cumulative),
    };
  });
  const lowest = series.reduce((a, m) => (m.cumulative < a.cumulative ? m : a), series[0]);
  return { series, lowest, endMonth: series[series.length - 1].month };
}
