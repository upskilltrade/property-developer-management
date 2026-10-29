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
  /** Rates for land-lease and construction-contract revenue (leasehold / split deals). */
  lease_tax_pct?: number | null;
  lease_fee_pct?: number | null;
  construction_tax_pct?: number | null;
  /** Whole project land (sq.m.), for the sellable-area ratio. */
  land_area_sqm?: number | null;
  /** Yearly interest on the money the project is short each month, beyond the owner's equity. */
  loan_rate_pct?: number | null;
  equity_amount?: number | null;
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
  /** Plot land of every unit (sq.m.): the sellable part of the project land. */
  totalPlotArea?: number;
  /** Parts of sold houses' leasehold/split contracts that are a land lease or a construction contract. */
  leaseRevenue?: number;
  constructionRevenue?: number;
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
  key:
    | "AGENT"
    | "TRANSFER"
    | "BUSINESS_TAX"
    | "LEASE_TAX"
    | "LEASE_FEE"
    | "CONSTRUCTION_TAX"
    | "INTEREST"
    | "INCOME_TAX";
  amount: number;
};

export type ForecastResult = {
  revenue: number;
  /** House-sale revenue that pays transfer fee and specific business tax. */
  houseRevenue: number;
  leaseRevenue: number;
  constructionRevenue: number;
  lines: ComputedLine[];
  costs: number;
  derived: DerivedCost[];
  profitBeforeTax: number;
  incomeTax: number;
  netProfit: number;
  margin: number;
  marginBeforeTax: number;
  /** Interest charged each month of the sell-out period (all 0 without a loan rate). */
  interestByMonth: number[];
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
  const salesRevenue = revenueLines
    .filter((l) => l.category === "SALES_HOUSES")
    .reduce((a, l) => a + value(l, 0), 0);
  // Land-lease and construction-contract parts are not a house sale: they leave the transfer-fee /
  // business-tax base and use their own rates.
  const leaseRevenue = Math.min(n(facts.leaseRevenue), salesRevenue);
  const constructionRevenue = Math.min(n(facts.constructionRevenue), salesRevenue - leaseRevenue);
  const houseRevenue = salesRevenue - leaseRevenue - constructionRevenue;

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
    derived.push({ key: "AGENT", amount: round(pct(plan.agent_commission_pct) * salesRevenue) });
  derived.push({
    key: "TRANSFER",
    amount: round(
      pct(plan.transfer_fee_pct) * pct(plan.developer_transfer_share_pct) * houseRevenue,
    ),
  });
  derived.push({ key: "BUSINESS_TAX", amount: round(pct(plan.business_tax_pct) * houseRevenue) });
  if (leaseRevenue > 0) {
    derived.push({ key: "LEASE_TAX", amount: round(pct(plan.lease_tax_pct) * leaseRevenue) });
    derived.push({ key: "LEASE_FEE", amount: round(pct(plan.lease_fee_pct) * leaseRevenue) });
  }
  if (constructionRevenue > 0)
    derived.push({
      key: "CONSTRUCTION_TAX",
      amount: round(pct(plan.construction_tax_pct) * constructionRevenue),
    });
  const months = monthsOf(plan);
  const interestByMonth = interest(plan, months, computed, derived);
  const interestTotal = round(interestByMonth.reduce((a, v) => a + v, 0));
  if (n(plan.loan_rate_pct) > 0) derived.push({ key: "INTEREST", amount: interestTotal });
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
    leaseRevenue: round(leaseRevenue),
    constructionRevenue: round(constructionRevenue),
    lines: computed,
    costs: round(costs),
    derived,
    profitBeforeTax: beforeTax,
    incomeTax,
    netProfit: net,
    margin: revenue ? net / revenue : 0,
    marginBeforeTax: revenue ? beforeTax / revenue : 0,
    interestByMonth,
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

const monthsOf = (plan: ForecastPlan) => Math.max(1, Math.round(n(plan.sell_out_months)));

/** Money in and out each month, by each line's timing (derived costs go with sales). */
function spread(
  months: number,
  lines: ComputedLine[],
  derived: DerivedCost[],
  interestByMonth: number[] = [],
) {
  const inflow = new Array<number>(months).fill(0);
  const outflow = new Array<number>(months).fill(0);
  const place = (arr: number[], amount: number, timing: ForecastLine["timing"]) => {
    if (!amount) return;
    if (timing === "START") arr[0] += amount;
    else if (timing === "END") arr[months - 1] += amount;
    else for (let i = 0; i < months; i++) arr[i] += amount / months;
  };
  for (const l of lines) {
    if (l.excluded) continue;
    place(l.kind === "REVENUE" ? inflow : outflow, l.forecast, l.timing);
  }
  for (const d of derived) {
    if (d.key === "INTEREST") continue;
    place(outflow, d.amount, d.key === "INCOME_TAX" ? "END" : "WITH_SALES");
  }
  interestByMonth.forEach((v, i) => (outflow[i] += v));
  return { inflow, outflow };
}

/**
 * Interest month by month: at each month end, whatever the project is short beyond the owner's
 * equity is borrowed at the plan's yearly rate. Interest paid adds to the shortfall, so a slower
 * sell-out costs more.
 */
function interest(
  plan: ForecastPlan,
  months: number,
  lines: ComputedLine[],
  derived: DerivedCost[],
) {
  const out = new Array<number>(months).fill(0);
  const monthly = pct(plan.loan_rate_pct) / 12;
  if (monthly <= 0) return out;
  const { inflow, outflow } = spread(months, lines, derived);
  const equity = n(plan.equity_amount);
  let cumulative = 0;
  for (let i = 0; i < months; i++) {
    cumulative += inflow[i] - outflow[i];
    out[i] = round(Math.max(0, -cumulative - equity) * monthly);
    cumulative -= out[i];
  }
  return out;
}

/** Spreads the forecast over the sell-out period by each line's timing. */
export function cashflow(plan: ForecastPlan, result: ForecastResult) {
  const months = monthsOf(plan);
  const { inflow, outflow } = spread(months, result.lines, result.derived, result.interestByMonth);

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

/**
 * Rule-of-thumb ranges for a Thai housing estate, as a share of revenue. They are a sense check
 * for the owner, not a standard: a plan outside a range is flagged, never refused.
 */
export const feasibilityGroups = {
  LAND: { min: 0.15, max: 0.3, categories: ["LAND"], derived: [] },
  DEVELOPMENT: {
    min: 0.08,
    max: 0.15,
    categories: ["SITE_PREP", "INFRASTRUCTURE", "COMMON_AREA", "UTILITY_GUARANTEE"],
    derived: [],
  },
  CONSTRUCTION: { min: 0.35, max: 0.45, categories: ["CONSTRUCTION"], derived: [] },
  SOFT: { min: 0.02, max: 0.04, categories: ["PERMITS", "DESIGN"], derived: [] },
  SALES: {
    min: 0.05,
    max: 0.08,
    categories: ["SHOWHOUSE", "MARKETING", "SALES_TEAM", "PROMOTIONS"],
    derived: ["AGENT"],
  },
  FINANCE: { min: 0.03, max: 0.06, categories: ["FINANCE"], derived: ["INTEREST"] },
  TRANSFER_TAX: {
    min: 0.04,
    max: 0.05,
    categories: [],
    derived: ["TRANSFER", "BUSINESS_TAX", "LEASE_TAX", "LEASE_FEE", "CONSTRUCTION_TAX"],
  },
  ADMIN: {
    min: 0.04,
    max: 0.07,
    categories: ["ADMIN", "CONTINGENCY", "JURISTIC_FUND", "WARRANTY_RESERVE", "HOLDING"],
    derived: [],
  },
} as const satisfies Record<
  string,
  { min: number; max: number; categories: string[]; derived: DerivedCost["key"][] }
>;
export type FeasibilityGroupKey = keyof typeof feasibilityGroups;

/** Go/no-go thresholds. */
export const feasibilityTargets = {
  /** Revenue ÷ total cost before income tax. */
  costMultiple: 1.25,
  /** Land cost ÷ revenue, at most. */
  landShare: 0.3,
  /** Plot land of all units ÷ project land, at least. */
  sellableRatio: 0.6,
  /** Profit before income tax ÷ revenue, at least. */
  marginBeforeTax: 0.15,
} as const;

export type CheckStatus = "OK" | "WARN" | "MISSING";
export type GroupStatus = "LOW" | "OK" | "HIGH";

export function feasibility(plan: ForecastPlan, result: ForecastResult, facts: ForecastFacts) {
  const { revenue } = result;
  const active = result.lines.filter((l) => l.kind === "COST" && !l.excluded);
  const byCategory = (cats: readonly string[]) =>
    active.filter((l) => cats.includes(l.category)).reduce((a, l) => a + l.forecast, 0);
  const byDerived = (keys: readonly string[]) =>
    result.derived.filter((d) => keys.includes(d.key)).reduce((a, d) => a + d.amount, 0);

  const groups = (Object.keys(feasibilityGroups) as FeasibilityGroupKey[]).map((key) => {
    const g = feasibilityGroups[key];
    const amount = round(byCategory(g.categories) + byDerived(g.derived));
    const share = revenue ? amount / revenue : 0;
    const status: GroupStatus = share > g.max ? "HIGH" : share < g.min ? "LOW" : "OK";
    return { key, amount, share, min: g.min, max: g.max, status };
  });

  const costBeforeTax = round(
    result.costs +
      result.derived.filter((d) => d.key !== "INCOME_TAX").reduce((a, d) => a + d.amount, 0),
  );
  const land = byCategory(["LAND"]);
  const plot = n(facts.totalPlotArea);
  const area = n(plan.land_area_sqm);
  const check = (value: number | null, ok: (v: number) => boolean) => ({
    value,
    status: (value == null ? "MISSING" : ok(value) ? "OK" : "WARN") as CheckStatus,
  });
  const t = feasibilityTargets;
  return {
    checks: {
      costMultiple: check(
        revenue > 0 && costBeforeTax > 0 ? revenue / costBeforeTax : null,
        (v) => v >= t.costMultiple,
      ),
      landShare: check(revenue > 0 && land > 0 ? land / revenue : null, (v) => v <= t.landShare),
      sellableRatio: check(area > 0 && plot > 0 ? plot / area : null, (v) => v >= t.sellableRatio),
      marginBeforeTax: check(
        revenue > 0 ? result.marginBeforeTax : null,
        (v) => v >= t.marginBeforeTax,
      ),
    },
    groups,
  };
}
