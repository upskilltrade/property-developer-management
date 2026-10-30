"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { aiConfigured, aiErrorKey } from "@/lib/ai";
import { formLocale, num, optStr, str, withFlash } from "@/lib/form";
import {
  competitorGrades,
  competitorStatuses,
  defaultAssumptions,
  landPriceKinds,
  marketByZone,
  offeringOptions,
  parseLatLng,
  productTypes,
  readAssumptions,
  type Competitor,
  type LandPrice,
  type Zone,
} from "@/lib/market";
import { analyzeMarket, researchArea } from "@/lib/market-ai";

const oneOf = <T extends string>(list: readonly T[], v: string, fallback: T | null = null) =>
  (list as readonly string[]).includes(v) ? (v as T) : fallback;
const positive = (fd: FormData, key: string) => {
  const v = num(fd, key);
  return v != null && v > 0 ? v : null;
};

/** Session, organization and safe return path for a market form. */
async function context(fd: FormData) {
  const locale = formLocale(fd);
  const base = `/${locale}/app/market`;
  const requested = str(fd, "return_to");
  const back = requested.startsWith(base) ? requested : base;
  const { supabase, isInternal, access, user } = await getSession(locale);
  if (!isInternal) redirect(withFlash(back, "error", "permission"));
  const org = access.find((g) => !["CUSTOMER", "CONTRACTOR", "INVESTOR"].includes(g.role_code))
    ?.organization_id as string | undefined;
  if (!org) redirect(withFlash(back, "error", "permission"));
  const finish = (error: { message?: string } | null, key = "1"): never => {
    if (error) {
      console.error("market save failed", error);
      redirect(
        withFlash(back, "error", error.message?.includes("row-level") ? "permission" : "invalid"),
      );
    }
    revalidatePath(base);
    redirect(withFlash(back, "saved", key));
  };
  return { locale, supabase, org, back, finish, userId: user.id };
}

/** The coordinate field, or the error key when it was filled but isn't a coordinate. */
function coordinate(fd: FormData, required: boolean) {
  const raw = str(fd, "coordinate");
  if (!raw) return required ? "invalid" : { lat: null, lng: null };
  return parseLatLng(raw) ?? "invalid";
}

export async function saveZone(fd: FormData) {
  const { supabase, org, back, finish, userId } = await context(fd);
  const at = coordinate(fd, true);
  const name = str(fd, "name");
  if (at === "invalid" || !name) redirect(withFlash(back, "error", "coordinate"));
  const row = {
    organization_id: org,
    name,
    center_lat: at.lat,
    center_lng: at.lng,
    radius_m: Math.round((positive(fd, "radius_km") ?? 2) * 1000),
    notes: optStr(fd, "notes"),
    updated_at: new Date().toISOString(),
  };
  const id = str(fd, "id");
  const { error } = id
    ? await supabase.from("market_zones").update(row).eq("id", id)
    : await supabase.from("market_zones").insert({ ...row, created_by: userId });
  finish(error);
}

export async function saveLandPrice(fd: FormData) {
  const { supabase, org, back, finish, userId } = await context(fd);
  const at = coordinate(fd, false);
  if (at === "invalid") redirect(withFlash(back, "error", "coordinate"));
  const price = positive(fd, "price_per_wah");
  const perRai = positive(fd, "price_per_rai");
  const perWah = price ?? (perRai ? perRai / 400 : null);
  if (!perWah) redirect(withFlash(back, "error", "invalid"));
  const row = {
    organization_id: org,
    lat: at.lat,
    lng: at.lng,
    location_text: optStr(fd, "location_text"),
    kind: oneOf(landPriceKinds, str(fd, "kind"), "ASKING"),
    price_per_wah: perWah,
    area_wah: positive(fd, "area_wah"),
    observed_on: optStr(fd, "observed_on"),
    source_url: optStr(fd, "source_url"),
    notes: optStr(fd, "notes"),
    verified: true,
  };
  const id = str(fd, "id");
  const { error } = id
    ? await supabase.from("land_prices").update(row).eq("id", id)
    : await supabase.from("land_prices").insert({ ...row, created_by: userId });
  finish(error);
}

export async function saveCompetitor(fd: FormData) {
  const { supabase, org, back, finish, userId } = await context(fd);
  const at = coordinate(fd, false);
  const name = str(fd, "name");
  if (at === "invalid" || !name)
    redirect(withFlash(back, "error", at === "invalid" ? "coordinate" : "invalid"));
  // Prices are typed in millions on the form.
  const million = (key: string) => {
    const v = positive(fd, key);
    return v == null ? null : v < 1000 ? v * 1_000_000 : v;
  };
  const row = {
    organization_id: org,
    name,
    developer: optStr(fd, "developer"),
    lat: at.lat,
    lng: at.lng,
    location_text: optStr(fd, "location_text"),
    product_type: oneOf(productTypes, str(fd, "product_type"), "POOL_VILLA"),
    status: oneOf(competitorStatuses, str(fd, "status"), "SELLING"),
    grade: oneOf(competitorGrades, str(fd, "grade")),
    price_min: million("price_min"),
    price_max: million("price_max"),
    house_area_min: positive(fd, "house_area_min"),
    house_area_max: positive(fd, "house_area_max"),
    land_area_min_wah: positive(fd, "land_area_min_wah"),
    land_area_max_wah: positive(fd, "land_area_max_wah"),
    bedrooms: optStr(fd, "bedrooms"),
    units_total: positive(fd, "units_total"),
    offerings: fd
      .getAll("offerings")
      .map(String)
      .filter((o) => (offeringOptions as readonly string[]).includes(o)),
    strengths: optStr(fd, "strengths"),
    weaknesses: optStr(fd, "weaknesses"),
    observed_on: optStr(fd, "observed_on"),
    source_url: optStr(fd, "source_url"),
    notes: optStr(fd, "notes"),
    verified: true,
    updated_at: new Date().toISOString(),
  };
  const id = str(fd, "id");
  const { error } = id
    ? await supabase.from("competitor_projects").update(row).eq("id", id)
    : await supabase.from("competitor_projects").insert({ ...row, created_by: userId });
  finish(error);
}

const tables = {
  zone: "market_zones",
  land: "land_prices",
  competitor: "competitor_projects",
} as const;

export async function deleteMarketRow(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const table = tables[str(fd, "table") as keyof typeof tables];
  if (!table) finish({ message: "invalid" });
  const { error } = await supabase.from(table).delete().eq("id", str(fd, "id"));
  finish(error, "deleted");
}

/** Marks an AI-found row as checked by a person. */
export async function verifyMarketRow(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const table = str(fd, "table") === "land" ? "land_prices" : "competitor_projects";
  const { error } = await supabase.from(table).update({ verified: true }).eq("id", str(fd, "id"));
  finish(error);
}

async function logTurn(
  supabase: Awaited<ReturnType<typeof context>>["supabase"],
  question: string,
  usage: { input_tokens: number; output_tokens: number },
  failed: boolean,
) {
  await supabase.rpc("log_assistant_turn", {
    question_text: question,
    tools_used: ["market"],
    tokens_in: usage.input_tokens,
    tokens_out: usage.output_tokens,
    stop: failed ? "error" : "end_turn",
  });
}

/** Searches the web around one zone and saves what it finds as unverified rows. */
export async function researchZone(fd: FormData) {
  const { supabase, org, back, userId } = await context(fd);
  if (!aiConfigured()) redirect(withFlash(back, "error", "ai_not_configured"));
  const { data: zone } = await supabase
    .from("market_zones")
    .select("id,name,center_lat,center_lng,radius_m")
    .eq("id", str(fd, "id"))
    .maybeSingle();
  if (!zone) redirect(withFlash(back, "error", "invalid"));
  const { data: known } = await supabase.from("competitor_projects").select("name");

  let errorKey: string | null = null;
  let usage = { input_tokens: 0, output_tokens: 0 };
  let added = 0;
  try {
    const found = await researchArea({
      area: zone.name,
      lat: zone.center_lat,
      lng: zone.center_lng,
      radiusKm: Math.max(1, Math.round(zone.radius_m / 1000)),
      known: (known ?? []).map((k) => k.name),
    });
    usage = found.usage;
    const today = new Date().toISOString().slice(0, 10);
    const ai = {
      organization_id: org,
      source: "AI",
      verified: false,
      observed_on: today,
      created_by: userId,
    };
    // A row without a coordinate is pinned to the zone centre so it counts in this zone.
    const pin = (lat: number | null, lng: number | null) =>
      lat != null && lng != null ? { lat, lng } : { lat: zone.center_lat, lng: zone.center_lng };
    const knownNames = new Set((known ?? []).map((k) => k.name.trim().toLowerCase()));
    const comps = found.competitors
      .filter((c) => !knownNames.has(c.name.trim().toLowerCase()))
      .map((c) => ({
        ...ai,
        ...c,
        ...pin(c.lat, c.lng),
        units_total: c.units_total == null ? null : Math.round(c.units_total),
        notes: c.lat == null ? `ตำแหน่งโดยประมาณ (กลางโซน ${zone.name})` : null,
      }));
    const lands = found.land_prices.map((l) => ({
      ...ai,
      ...l,
      ...pin(l.lat, l.lng),
      notes: l.lat == null ? `ตำแหน่งโดยประมาณ (กลางโซน ${zone.name})` : null,
    }));
    const results = await Promise.all([
      comps.length ? supabase.from("competitor_projects").insert(comps) : { error: null },
      lands.length ? supabase.from("land_prices").insert(lands) : { error: null },
    ]);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error("market research save failed", failed.error);
      errorKey = "invalid";
    }
    added = comps.length + lands.length;
  } catch (e) {
    console.error("market research failed", e);
    errorKey = `ai_${aiErrorKey(e)}`;
  }
  await logTurn(supabase, `[market-research] ${zone.name}`, usage, Boolean(errorKey));
  if (errorKey) redirect(withFlash(back, "error", errorKey));
  revalidatePath(`/${formLocale(fd)}/app/market`);
  if (!added) redirect(withFlash(back, "error", "research_empty"));
  redirect(withFlash(back, "saved", "research"));
}

/** Reads every zone's numbers and asks the AI where to play; saves the answer. */
export async function runMarketAnalysis(fd: FormData) {
  const { supabase, org, back, userId } = await context(fd);
  if (!aiConfigured()) redirect(withFlash(back, "error", "ai_not_configured"));
  const a = readAssumptions(
    Object.fromEntries(Object.keys(defaultAssumptions).map((k) => [k, str(fd, k)])),
  );
  const [{ data: zones }, { data: lands }, { data: comps }] = await Promise.all([
    supabase.from("market_zones").select("*"),
    supabase.from("land_prices").select("*"),
    supabase.from("competitor_projects").select("*"),
  ]);
  const { zones: stats, outside } = marketByZone(
    (zones ?? []) as Zone[],
    (lands ?? []) as LandPrice[],
    (comps ?? []) as Competitor[],
    a,
  );
  if (!stats.length) redirect(withFlash(back, "error", "no_zones"));

  let errorKey: string | null = null;
  let usage = { input_tokens: 0, output_tokens: 0 };
  try {
    const all = outside.lands.length || outside.competitors.length ? [...stats, outside] : stats;
    const result = await analyzeMarket(all, a);
    usage = result.usage;
    const { error } = await supabase.from("market_analyses").insert({
      organization_id: org,
      result: { ...result.analysis, assumptions: a },
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      created_by: userId,
    });
    if (error) errorKey = "invalid";
  } catch (e) {
    console.error("market analysis failed", e);
    errorKey = `ai_${aiErrorKey(e)}`;
  }
  await logTurn(supabase, "[market-analysis]", usage, Boolean(errorKey));
  if (errorKey) redirect(withFlash(back, "error", errorKey));
  revalidatePath(`/${formLocale(fd)}/app/market`);
  redirect(withFlash(back, "saved", "analysis"));
}
