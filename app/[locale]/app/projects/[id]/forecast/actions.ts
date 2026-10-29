"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formLocale, numText, optStr, str, withFlash } from "@/lib/form";

async function context(fd: FormData) {
  const locale = formLocale(fd);
  const projectId = str(fd, "project_id");
  const back = `/${locale}/app/projects/${projectId}/forecast`;
  const supabase = await createClient();
  const done = (error: { message: string } | null) => {
    if (error)
      redirect(
        withFlash(
          back,
          "error",
          error.message.includes("Not authorized")
            ? "permission"
            : error.message.includes("Invalid plan")
              ? "pctRange"
              : "invalid",
        ),
      );
    revalidatePath(back);
    redirect(withFlash(back, "saved", "forecast"));
  };
  /** Reads number fields; a value that still isn't a number sends the user back with a clear message. */
  const numbers = (keys: string[]) => {
    const out: Record<string, string> = {};
    for (const k of keys) {
      const v = numText(fd, k);
      if (v === null) redirect(withFlash(back, "error", "number"));
      out[k] = v;
    }
    return out;
  };
  return { projectId, supabase, done, numbers };
}

export async function initForecast(fd: FormData) {
  const { projectId, supabase, done } = await context(fd);
  const { error } = await supabase.rpc("init_project_forecast", { target_project: projectId });
  done(error);
}

export async function saveForecastPlan(fd: FormData) {
  const { projectId, supabase, done, numbers } = await context(fd);
  const data: Record<string, string> = {
    start_month: str(fd, "start_month"),
    sales_mode: str(fd, "sales_mode"),
    notes: str(fd, "notes"),
    ...numbers([
      "sell_out_months",
      "agent_commission_pct",
      "target_margin_pct",
      "transfer_fee_pct",
      "developer_transfer_share_pct",
      "business_tax_pct",
      "income_tax_pct",
      "lease_tax_pct",
      "lease_fee_pct",
      "construction_tax_pct",
      "land_area_sqm",
      "loan_rate_pct",
      "equity_amount",
    ]),
  };
  if (data.start_month && /^\d{4}-\d{2}$/.test(data.start_month)) data.start_month += "-01";
  const { error } = await supabase.rpc("save_forecast_plan", { target_project: projectId, data });
  done(error);
}

export async function saveForecastLine(fd: FormData) {
  const { projectId, supabase, done, numbers } = await context(fd);
  const n = numbers(["amount", "rate", "quantity", "pct"]);
  const { error } = await supabase.rpc("save_forecast_line", {
    target_project: projectId,
    data: {
      id: optStr(fd, "line_id"),
      kind: str(fd, "kind"),
      category: str(fd, "category"),
      label: str(fd, "label"),
      method: str(fd, "method"),
      ...n,
      timing: str(fd, "timing"),
      cost_category_id: optStr(fd, "cost_category_id"),
      self_sales_only: fd.get("self_sales_only") === "on",
    },
  });
  done(error);
}

export async function removeForecastLine(fd: FormData) {
  const { supabase, done } = await context(fd);
  const { error } = await supabase.rpc("remove_forecast_line", { target_line: str(fd, "line_id") });
  done(error);
}
