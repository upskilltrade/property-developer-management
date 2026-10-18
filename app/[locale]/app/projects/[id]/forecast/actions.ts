"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formLocale, optStr, str, withFlash } from "@/lib/form";

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
          error.message.includes("Not authorized") ? "permission" : "invalid",
        ),
      );
    revalidatePath(back);
    redirect(withFlash(back, "saved", "forecast"));
  };
  return { projectId, supabase, done };
}

export async function initForecast(fd: FormData) {
  const { projectId, supabase, done } = await context(fd);
  const { error } = await supabase.rpc("init_project_forecast", { target_project: projectId });
  done(error);
}

export async function saveForecastPlan(fd: FormData) {
  const { projectId, supabase, done } = await context(fd);
  const keys = [
    "start_month",
    "sell_out_months",
    "sales_mode",
    "agent_commission_pct",
    "target_margin_pct",
    "transfer_fee_pct",
    "developer_transfer_share_pct",
    "business_tax_pct",
    "income_tax_pct",
    "notes",
  ];
  const data = Object.fromEntries(keys.map((k) => [k, str(fd, k)]));
  if (data.start_month && /^\d{4}-\d{2}$/.test(data.start_month)) data.start_month += "-01";
  const { error } = await supabase.rpc("save_forecast_plan", { target_project: projectId, data });
  done(error);
}

export async function saveForecastLine(fd: FormData) {
  const { projectId, supabase, done } = await context(fd);
  const { error } = await supabase.rpc("save_forecast_line", {
    target_project: projectId,
    data: {
      id: optStr(fd, "line_id"),
      kind: str(fd, "kind"),
      category: str(fd, "category"),
      label: str(fd, "label"),
      method: str(fd, "method"),
      amount: str(fd, "amount").replace(/,/g, ""),
      rate: str(fd, "rate").replace(/,/g, ""),
      quantity: str(fd, "quantity").replace(/,/g, ""),
      pct: str(fd, "pct"),
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
