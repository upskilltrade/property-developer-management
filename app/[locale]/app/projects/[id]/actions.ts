"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { code, formLocale, num, optStr, str, withFlash } from "@/lib/form";
import { unitStatuses } from "@/lib/status";

async function context(fd: FormData, page: "" | "/setup") {
  const locale = formLocale(fd);
  const projectId = str(fd, "project_id");
  if (!projectId) redirect(`/${locale}/app/projects`);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  const back = `/${locale}/app/projects/${projectId}${page}`;
  const done = (error: unknown, key: string) => {
    if (error) redirect(withFlash(back, "error", key));
    revalidatePath(`/${locale}/app`, "layout");
    redirect(withFlash(back, "saved", key));
  };
  return { locale, projectId, supabase, back, done };
}

export async function addPhase(fd: FormData) {
  const { projectId, supabase, back, done } = await context(fd, "/setup");
  const phaseCode = code(fd, "code");
  const name = str(fd, "name");
  if (!phaseCode || !name) redirect(withFlash(back, "error", "invalid"));
  const { error } = await supabase.from("phases").insert({
    project_id: projectId,
    code: phaseCode,
    name,
    sequence_no: num(fd, "sequence_no") ?? 1,
  });
  done(error, "phase");
}

export async function addPlot(fd: FormData) {
  const { projectId, supabase, back, done } = await context(fd, "/setup");
  const plotCode = code(fd, "code");
  if (!plotCode) redirect(withFlash(back, "error", "invalid"));
  const { error } = await supabase.from("plots").insert({
    project_id: projectId,
    phase_id: optStr(fd, "phase_id"),
    code: plotCode,
    land_area_sqm: num(fd, "land_area_sqm"),
  });
  done(error, "plot");
}

export async function addHouseType(fd: FormData) {
  const { projectId, supabase, back, done } = await context(fd, "/setup");
  const { data: project } = await supabase
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .single();
  const typeCode = code(fd, "code");
  const name = str(fd, "name");
  if (!project || !typeCode || !name) redirect(withFlash(back, "error", "invalid"));
  const { error } = await supabase.from("house_types").insert({
    organization_id: project.organization_id,
    code: typeCode,
    name,
    bedrooms: num(fd, "bedrooms") ?? 0,
    bathrooms: num(fd, "bathrooms") ?? 0,
    gross_floor_area_sqm: num(fd, "gross_floor_area_sqm"),
  });
  done(error, "house_type");
}

export async function addUnit(fd: FormData) {
  const { projectId, supabase, back, done } = await context(fd, "");
  const unitCode = code(fd, "code");
  const status = str(fd, "status") || "AVAILABLE";
  if (!unitCode || !(unitStatuses as readonly string[]).includes(status))
    redirect(withFlash(back, "error", "invalid"));
  const { error } = await supabase.from("units").insert({
    project_id: projectId,
    phase_id: optStr(fd, "phase_id"),
    plot_id: optStr(fd, "plot_id"),
    house_type_id: optStr(fd, "house_type_id"),
    code: unitCode,
    name: optStr(fd, "name"),
    status,
    list_price: num(fd, "list_price"),
    currency_code: "THB",
  });
  done(error, "unit");
}

const bankError = (message: string) =>
  message.includes("Duplicate")
    ? "duplicateBankAccount"
    : message.includes("Not authorized")
      ? "permission"
      : "invalidBankAccount";

export async function saveBankAccount(fd: FormData) {
  const { projectId, supabase, back, done } = await context(fd, "/setup");
  const { error } = await supabase.rpc("save_project_bank_account", {
    target_project: projectId,
    data: {
      id: optStr(fd, "account_id"),
      bank_name: str(fd, "bank_name"),
      account_name: str(fd, "account_name"),
      account_number: str(fd, "account_number"),
      branch: optStr(fd, "branch"),
      account_type: str(fd, "account_type"),
      purpose: str(fd, "purpose"),
      promptpay_id: optStr(fd, "promptpay_id"),
      show_to_customers: fd.get("show_to_customers") === "on",
      is_default_receipt: fd.get("is_default_receipt") === "on",
      opening_balance: num(fd, "opening_balance"),
      opening_date: optStr(fd, "opening_date"),
      notes: optStr(fd, "notes"),
    },
  });
  if (error) redirect(withFlash(back, "error", bankError(error.message)));
  done(null, "bank_account");
}

export async function setDefaultBankAccount(fd: FormData) {
  const { supabase, back, done } = await context(fd, "/setup");
  const { error } = await supabase.rpc("set_project_default_bank_account", {
    account: str(fd, "account_id"),
  });
  if (error) redirect(withFlash(back, "error", bankError(error.message)));
  done(null, "bank_account");
}

export async function setBankAccountActive(fd: FormData) {
  const { supabase, back, done } = await context(fd, "/setup");
  const { error } = await supabase.rpc("set_project_bank_account_active", {
    account: str(fd, "account_id"),
    is_active: str(fd, "active") === "true",
  });
  if (error) redirect(withFlash(back, "error", bankError(error.message)));
  done(null, "bank_account");
}
