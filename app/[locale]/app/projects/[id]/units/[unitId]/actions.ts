"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formLocale, num, numText, optStr, str, withFlash } from "@/lib/form";
import { constructionStages, unitStatuses } from "@/lib/status";

async function context(fd: FormData) {
  const locale = formLocale(fd);
  const projectId = str(fd, "project_id");
  const unitId = str(fd, "unit_id");
  if (!projectId || !unitId) redirect(`/${locale}/app/projects`);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  const back = `/${locale}/app/projects/${projectId}/units/${unitId}`;
  const done = (error: unknown, key: string) => {
    if (error) redirect(withFlash(back, "error", key));
    revalidatePath(`/${locale}/app`, "layout");
    redirect(withFlash(back, "saved", key));
  };
  return { projectId, unitId, supabase, back, done };
}

const now = () => new Date().toISOString();

export async function saveConstruction(fd: FormData) {
  const { unitId, supabase, back, done } = await context(fd);
  const stage = str(fd, "stage") || "NOT_STARTED";
  const progress = num(fd, "progress_percent") ?? 0;
  if (!(constructionStages as readonly string[]).includes(stage) || progress < 0 || progress > 100)
    redirect(withFlash(back, "error", "invalid"));
  const { error } = await supabase.from("unit_construction").upsert(
    {
      unit_id: unitId,
      progress_percent: progress,
      stage,
      start_date: optStr(fd, "start_date"),
      target_completion_date: optStr(fd, "target_completion_date"),
      notes: optStr(fd, "notes"),
      updated_at: now(),
    },
    { onConflict: "unit_id" },
  );
  done(error, "construction");
}

export async function saveFinancials(fd: FormData) {
  const { unitId, supabase, done } = await context(fd);
  const { error } = await supabase.from("unit_financials").upsert(
    {
      unit_id: unitId,
      budget_amount: num(fd, "budget_amount"),
      committed_amount: num(fd, "committed_amount") ?? 0,
      actual_cost: num(fd, "actual_cost") ?? 0,
      updated_at: now(),
    },
    { onConflict: "unit_id" },
  );
  done(error, "financial");
}

export async function saveSale(fd: FormData) {
  const { projectId, unitId, supabase, back, done } = await context(fd);
  const status = str(fd, "status") || "AVAILABLE";
  const listPrice = numText(fd, "list_price");
  const agreedPrice = numText(fd, "agreed_price");
  if (listPrice === null || agreedPrice === null) redirect(withFlash(back, "error", "number"));
  if (!(unitStatuses as readonly string[]).includes(status))
    redirect(withFlash(back, "error", "invalid"));

  let customerId: string | null = null;
  const name = str(fd, "customer_name");
  if (name) {
    const [{ data: project }, { data: existing }] = await Promise.all([
      supabase.from("projects").select("organization_id").eq("id", projectId).single(),
      supabase.from("unit_sales").select("customer_id").eq("unit_id", unitId).maybeSingle(),
    ]);
    if (!project) redirect(withFlash(back, "error", "sale"));
    const customer = {
      organization_id: project.organization_id,
      full_name: name,
      phone: optStr(fd, "phone"),
      email: optStr(fd, "email"),
      updated_at: now(),
    };
    const result = existing?.customer_id
      ? await supabase
          .from("customers")
          .update(customer)
          .eq("id", existing.customer_id)
          .select("id")
          .single()
      : await supabase.from("customers").insert(customer).select("id").single();
    if (result.error) redirect(withFlash(back, "error", "customer"));
    customerId = result.data?.id ?? existing?.customer_id ?? null;
  }

  const { error } = await supabase.from("unit_sales").upsert(
    {
      unit_id: unitId,
      customer_id: customerId,
      status,
      agreed_price: agreedPrice ? Number(agreedPrice) : null,
      reservation_date: optStr(fd, "reservation_date"),
      contract_date: optStr(fd, "contract_date"),
      transfer_date: optStr(fd, "transfer_date"),
      notes: optStr(fd, "notes"),
      updated_at: now(),
    },
    { onConflict: "unit_id" },
  );
  if (error) redirect(withFlash(back, "error", "sale"));

  const { error: unitError } = await supabase
    .from("units")
    .update({
      status,
      ...(fd.has("list_price") ? { list_price: listPrice ? Number(listPrice) : null } : {}),
      updated_at: now(),
    })
    .eq("id", unitId)
    .eq("project_id", projectId);
  done(unitError, "sale");
}

export async function linkCustomerAccount(fd: FormData) {
  const { supabase, back, done } = await context(fd);
  const customerId = str(fd, "customer_id");
  const email = str(fd, "email");
  if (!customerId || !email) redirect(withFlash(back, "error", "invalid"));
  const { error } = await supabase.rpc("link_customer_account", {
    target_customer: customerId,
    account_email: email,
  });
  if (error?.message.includes("No account")) redirect(withFlash(back, "error", "noAccount"));
  if (error?.message.includes("Not authorized")) redirect(withFlash(back, "error", "permission"));
  done(error, "link");
}
