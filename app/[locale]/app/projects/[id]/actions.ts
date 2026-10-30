"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { code, formLocale, num, numText, optStr, str, withFlash } from "@/lib/form";
import { unitStatuses } from "@/lib/status";
import { defaultExtraLandPerWah, suggestedPrice } from "@/lib/unit-pricing";

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

type Client = Awaited<ReturnType<typeof createClient>>;

/** The phase a plot sits in; a house on a plot always takes the plot's phase. */
async function plotPhase(supabase: Client, plotId: string | null) {
  if (!plotId) return null;
  const { data } = await supabase.from("plots").select("phase_id").eq("id", plotId).single();
  return (data?.phase_id as string | null) ?? null;
}

/** Deletes one row; the RLS policy only lets a manager delete a row nothing uses. */
async function deleteUnused(
  supabase: Client,
  table: "phases" | "house_types",
  id: string,
  back: string,
  inUse: "phaseInUse" | "houseTypeInUse",
) {
  const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
  if (error || !data?.length) redirect(withFlash(back, "error", inUse));
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

export async function updatePhase(fd: FormData) {
  const { projectId, supabase, back, done } = await context(fd, "/setup");
  const phaseCode = code(fd, "code");
  const name = str(fd, "name");
  if (!phaseCode || !name) redirect(withFlash(back, "error", "invalid"));
  const { data, error } = await supabase
    .from("phases")
    .update({ code: phaseCode, name, sequence_no: num(fd, "sequence_no") ?? 1 })
    .eq("id", str(fd, "phase_id"))
    .eq("project_id", projectId)
    .select("id");
  if (!error && !data?.length) redirect(withFlash(back, "error", "permission"));
  done(error, "phase");
}

/** Deletes a phase that has no plots or houses. */
export async function deletePhase(fd: FormData) {
  const { projectId, supabase, back, done } = await context(fd, "/setup");
  const phaseId = str(fd, "phase_id");
  const [{ count: plotCount }, { count: unitCount }] = await Promise.all([
    supabase.from("plots").select("id", { count: "exact", head: true }).eq("phase_id", phaseId),
    supabase.from("units").select("id", { count: "exact", head: true }).eq("phase_id", phaseId),
  ]);
  if (plotCount || unitCount) redirect(withFlash(back, "error", "phaseInUse"));
  const { data: phase } = await supabase
    .from("phases")
    .select("id")
    .eq("id", phaseId)
    .eq("project_id", projectId)
    .single();
  if (!phase) redirect(withFlash(back, "error", "permission"));
  await deleteUnused(supabase, "phases", phaseId, back, "phaseInUse");
  done(null, "phase");
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

export async function updatePlot(fd: FormData) {
  const { projectId, supabase, back, done } = await context(fd, "/setup");
  const plotCode = code(fd, "code");
  if (!plotCode) redirect(withFlash(back, "error", "invalid"));
  const { data, error } = await supabase
    .from("plots")
    .update({
      phase_id: optStr(fd, "phase_id"),
      code: plotCode,
      land_area_sqm: num(fd, "land_area_sqm"),
    })
    .eq("id", str(fd, "plot_id"))
    .eq("project_id", projectId)
    .select("id");
  if (!error && !data?.length) redirect(withFlash(back, "error", "permission"));
  // Houses on the plot belong to the plot's phase.
  const { error: unitsError } = error
    ? { error }
    : await supabase
        .from("units")
        .update({ phase_id: optStr(fd, "phase_id"), updated_at: new Date().toISOString() })
        .eq("plot_id", str(fd, "plot_id"))
        .eq("project_id", projectId);
  done(unitsError, "plot");
}

/** Deletes a plot that no unit sits on. */
export async function deletePlot(fd: FormData) {
  const { projectId, supabase, back, done } = await context(fd, "/setup");
  const plotId = str(fd, "plot_id");
  const { count } = await supabase
    .from("units")
    .select("id", { count: "exact", head: true })
    .eq("plot_id", plotId);
  if (count) redirect(withFlash(back, "error", "plotHasUnits"));
  const { data, error } = await supabase
    .from("plots")
    .delete()
    .eq("id", plotId)
    .eq("project_id", projectId)
    .select("id");
  if (!error && !data?.length) redirect(withFlash(back, "error", "permission"));
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

export async function updateHouseType(fd: FormData) {
  const { supabase, back, done } = await context(fd, "/setup");
  const typeCode = code(fd, "code");
  const name = str(fd, "name");
  if (!typeCode || !name) redirect(withFlash(back, "error", "invalid"));
  const { data, error } = await supabase
    .from("house_types")
    .update({
      code: typeCode,
      name,
      bedrooms: num(fd, "bedrooms") ?? 0,
      bathrooms: num(fd, "bathrooms") ?? 0,
      gross_floor_area_sqm: num(fd, "gross_floor_area_sqm"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", str(fd, "house_type_id"))
    .select("id");
  if (!error && !data?.length) redirect(withFlash(back, "error", "permission"));
  done(error, "house_type");
}

/** Deletes a house type no house, schedule template or design package uses. */
export async function deleteHouseType(fd: FormData) {
  const { supabase, back, done } = await context(fd, "/setup");
  const typeId = str(fd, "house_type_id");
  const { count } = await supabase
    .from("units")
    .select("id", { count: "exact", head: true })
    .eq("house_type_id", typeId);
  if (count) redirect(withFlash(back, "error", "houseTypeInUse"));
  await deleteUnused(supabase, "house_types", typeId, back, "houseTypeInUse");
  done(null, "house_type");
}

/** Edits a house's code, plot and house type; its phase follows the plot. */
export async function updateUnit(fd: FormData) {
  const { projectId, supabase, back, done } = await context(fd, "/setup");
  const unitCode = code(fd, "code");
  if (!unitCode) redirect(withFlash(back, "error", "invalid"));
  const plotId = optStr(fd, "plot_id");
  const { data, error } = await supabase
    .from("units")
    .update({
      code: unitCode,
      name: optStr(fd, "name"),
      plot_id: plotId,
      phase_id: plotId ? await plotPhase(supabase, plotId) : optStr(fd, "phase_id"),
      house_type_id: optStr(fd, "house_type_id"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", str(fd, "unit_id"))
    .eq("project_id", projectId)
    .select("id");
  if (!error && !data?.length) redirect(withFlash(back, "error", "permission"));
  done(error, "unit");
}

export async function addUnit(fd: FormData) {
  const { projectId, supabase, back, done } = await context(fd, "");
  const unitCode = code(fd, "code");
  const status = str(fd, "status") || "AVAILABLE";
  if (!unitCode || !(unitStatuses as readonly string[]).includes(status))
    redirect(withFlash(back, "error", "invalid"));
  const plotId = optStr(fd, "plot_id");
  const { error } = await supabase.from("units").insert({
    project_id: projectId,
    phase_id: (await plotPhase(supabase, plotId)) ?? optStr(fd, "phase_id"),
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

/**
 * Saves list prices for many houses at once (setup page). Only rows whose value changed are
 * written; a blank clears the price. Row-level security decides who may change units.
 */
export async function saveUnitPrices(fd: FormData) {
  const { supabase, back, done } = await context(fd, "/setup");
  const changes: { id: string; price: number | null }[] = [];
  for (const [key] of fd.entries()) {
    if (!key.startsWith("price:")) continue;
    const id = key.slice(6);
    const value = numText(fd, key);
    if (value === null) redirect(withFlash(back, "error", "number"));
    if (value === (numText(fd, `orig:${id}`) ?? "")) continue;
    changes.push({ id, price: value ? Number(value) : null });
  }
  for (const c of changes) {
    const { data, error } = await supabase
      .from("units")
      .update({ list_price: c.price, updated_at: new Date().toISOString() })
      .eq("id", c.id)
      .eq("project_id", str(fd, "project_id"))
      .select("id");
    if (error || !data?.length) redirect(withFlash(back, "error", "permission"));
  }
  done(null, "prices");
}

/**
 * Saves the project's pricing settings (base price and extra-land charge per ตร.ว.).
 * With apply=1 it also reprices every AVAILABLE or HOLD unit from its plot size;
 * units already reserved or sold keep their price.
 */
export async function savePricing(fd: FormData) {
  const { projectId, supabase, back, done } = await context(fd, "/setup");
  const base = numText(fd, "base_unit_price");
  const perWah = numText(fd, "extra_land_price_per_wah");
  if (base === null || perWah === null) redirect(withFlash(back, "error", "number"));
  const rate = perWah ? Number(perWah) : defaultExtraLandPerWah;
  const { data: saved, error } = await supabase
    .from("projects")
    .update({
      base_unit_price: base ? Number(base) : null,
      extra_land_price_per_wah: rate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .select("id");
  if (error || !saved?.length) redirect(withFlash(back, "error", "permission"));
  if (str(fd, "apply") !== "1") done(null, "pricing");
  if (!base) redirect(withFlash(back, "error", "invalid"));

  const [{ data: plots }, { data: units }] = await Promise.all([
    supabase.from("plots").select("id,land_area_sqm").eq("project_id", projectId),
    supabase.from("units").select("id,status,plot_id").eq("project_id", projectId),
  ]);
  const areaOf = new Map((plots ?? []).map((p) => [p.id, p.land_area_sqm as number | null]));
  const areas = [...areaOf.values()].filter((a): a is number => a != null).map(Number);
  const standard = areas.length ? Math.min(...areas) : null;
  for (const u of units ?? []) {
    if (!["AVAILABLE", "HOLD"].includes(u.status)) continue;
    const area = u.plot_id ? areaOf.get(u.plot_id) : null;
    const { error: e } = await supabase
      .from("units")
      .update({
        list_price: suggestedPrice(
          Number(base),
          area == null ? null : Number(area),
          standard,
          rate,
        ),
        updated_at: new Date().toISOString(),
      })
      .eq("id", u.id)
      .eq("project_id", projectId);
    if (e) redirect(withFlash(back, "error", "permission"));
  }
  done(null, "prices");
}
