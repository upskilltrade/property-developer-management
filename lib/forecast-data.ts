import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { toNumber } from "@/lib/format";
import type { ForecastFacts, ForecastLine, ForecastPlan } from "@/lib/forecast";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type One<T> = T | T[] | null | undefined;
const one = <T>(v: One<T>): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

const soldStatuses = new Set(["RESERVED", "CONTRACTED", "SOLD", "TRANSFERRED"]);

/** The plan, its lines and what the system already knows, read through the viewer's session. */
export async function loadForecast(supabase: Supabase, projectId: string) {
  const [
    { data: plan },
    { data: lines },
    { data: units },
    { data: payments },
    { data: cost },
    { data: categories },
  ] = await Promise.all([
    supabase.from("forecast_plans").select("*").eq("project_id", projectId).maybeSingle(),
    supabase
      .from("forecast_lines")
      .select(
        "id,kind,category,label,method,amount,rate,quantity,pct,timing,cost_category_id,self_sales_only",
      )
      .eq("project_id", projectId)
      .is("removed_at", null)
      .order("sort_order"),
    supabase
      .from("units")
      .select(
        "id,status,list_price,house_types(gross_floor_area_sqm),unit_sales(status,agreed_price)",
      )
      .eq("project_id", projectId),
    supabase.from("payments").select("amount").eq("project_id", projectId).eq("status", "VALID"),
    supabase.rpc("get_cost_report", { target_project: projectId }),
    supabase.from("cost_categories").select("id,code,name").eq("active", true).order("code"),
  ]);

  let soldValue = 0;
  let soldUnits = 0;
  let unsoldListValue = 0;
  let unpricedUnits = 0;
  let totalFloorArea = 0;
  for (const u of units ?? []) {
    const sale = one(u.unit_sales as One<{ status: string | null; agreed_price: number | null }>);
    const sold = soldStatuses.has(sale?.status ?? "") || soldStatuses.has(String(u.status));
    if (sold) {
      soldUnits++;
      soldValue += toNumber(sale?.agreed_price ?? u.list_price);
    } else {
      // Asking price, or a price already agreed on a house not yet marked sold.
      const price = toNumber(u.list_price) || toNumber(sale?.agreed_price);
      if (price > 0) unsoldListValue += price;
      else unpricedUnits++;
    }
    totalFloorArea += toNumber(
      one(u.house_types as One<{ gross_floor_area_sqm: number | null }>)?.gross_floor_area_sqm,
    );
  }
  const actualByCategory = new Map<string, { actual: number; committed: number }>();
  for (const c of (cost ?? []) as { cost_category_id: string; actual: number; committed: number }[])
    actualByCategory.set(c.cost_category_id, {
      actual: toNumber(c.actual),
      committed: toNumber(c.committed),
    });

  const facts: ForecastFacts = {
    units: (units ?? []).length,
    soldValue,
    soldUnits,
    unsoldListValue,
    unpricedUnits,
    collected: (payments ?? []).reduce((a, p) => a + toNumber(p.amount), 0),
    totalFloorArea,
    actualByCategory,
  };
  const num = (v: unknown) => (v == null ? null : toNumber(v));
  return {
    plan: plan
      ? ({
          start_month: plan.start_month,
          sell_out_months: plan.sell_out_months,
          sales_mode: plan.sales_mode,
          agent_commission_pct: num(plan.agent_commission_pct),
          target_margin_pct: num(plan.target_margin_pct),
          transfer_fee_pct: num(plan.transfer_fee_pct),
          developer_transfer_share_pct: num(plan.developer_transfer_share_pct),
          business_tax_pct: num(plan.business_tax_pct),
          income_tax_pct: num(plan.income_tax_pct),
          notes: plan.notes,
        } as ForecastPlan)
      : null,
    updatedAt: plan?.updated_at as string | undefined,
    lines: ((lines ?? []) as ForecastLine[]).map((l) => ({
      ...l,
      amount: toNumber(l.amount),
      rate: toNumber(l.rate),
      quantity: toNumber(l.quantity),
      pct: toNumber(l.pct),
    })),
    facts,
    categories: categories ?? [],
  };
}
