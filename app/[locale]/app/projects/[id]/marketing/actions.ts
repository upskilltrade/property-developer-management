"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formLocale, numText, optStr, str, withFlash } from "@/lib/form";
import { aiConfigured, aiErrorKey } from "@/lib/ai";
import {
  assetCategories,
  assetLanguages,
  assetStatuses,
  campaignObjectives,
  campaignStatuses,
  channels,
  copyFormats,
  copyLanguages,
  copyStatuses,
  aiReadable,
  imageMediaType,
  marketingErrorKey,
  mergePlan,
  oneOf,
  parseColors,
  parseTags,
  pickMany,
} from "@/lib/marketing";
import { draftCampaign, draftMarketingPlan, type PlanFile } from "@/lib/marketing-ai";

const BUCKET = "marketing-files";

/** Session, the project (with its organization) and a safe return path for a marketing form. */
async function context(fd: FormData) {
  const locale = formLocale(fd);
  const projectId = str(fd, "project_id");
  const base = `/${locale}/app/projects/${projectId}/marketing`;
  const requested = str(fd, "return_to");
  const back = requested.startsWith(base) ? requested : base;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  const { data: project } = await supabase
    .from("projects")
    .select("id,organization_id,code,name")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) redirect(withFlash(back, "error", "permission"));
  const fail = (key: string): never => redirect(withFlash(back, "error", key));
  const finish = (error: { message?: string } | null, key = "1", to = back): never => {
    if (error) {
      console.error("marketing save failed", error);
      fail(marketingErrorKey(error.message));
    }
    revalidatePath(base, "layout");
    redirect(withFlash(to, "saved", key));
  };
  return { locale, supabase, user, project, base, back, fail, finish };
}

/** A typed-in amount: "" -> null, not a number -> the "number" flash. */
function amount(fd: FormData, key: string, fail: (k: string) => never) {
  const v = numText(fd, key);
  if (v === null) fail("number");
  if (!v) return null;
  const n = Number(v);
  if (n < 0) fail("number");
  return n;
}
const count = (fd: FormData, key: string, fail: (k: string) => never) => {
  const n = amount(fd, key, fail);
  return n == null ? null : Math.round(n);
};
const date = (fd: FormData, key: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(str(fd, key)) ? str(fd, key) : null;

/** The uploaded object's path, only when it sits in this project's folder. */
function uploadedPath(fd: FormData, org: string, project: string) {
  const path = str(fd, "file_path");
  return path.startsWith(`${org}/${project}/`) && !path.includes("..") ? path : null;
}
const fileMeta = (fd: FormData) => ({
  file_name: optStr(fd, "file_name")?.slice(0, 200) ?? null,
  mime_type: optStr(fd, "mime_type")?.slice(0, 120) ?? null,
  size_bytes: Number(str(fd, "size_bytes")) || null,
});

// ---------------------------------------------------------------- plan

export async function savePlan(fd: FormData) {
  const { supabase, user, project, fail, finish } = await context(fd);
  const start = date(fd, "start_date");
  const end = date(fd, "end_date");
  if (start && end && end < start) fail("invalid");
  const { error } = await supabase.from("marketing_plans").upsert(
    {
      organization_id: project.organization_id,
      project_id: project.id,
      tagline: optStr(fd, "tagline"),
      location_text: optStr(fd, "location_text"),
      website_url: optStr(fd, "website_url"),
      target_audience: optStr(fd, "target_audience"),
      personas: optStr(fd, "personas"),
      usp: optStr(fd, "usp"),
      key_message: optStr(fd, "key_message"),
      positioning: optStr(fd, "positioning"),
      competitors: optStr(fd, "competitors"),
      brand_tone: optStr(fd, "brand_tone"),
      brand_fonts: optStr(fd, "brand_fonts"),
      brand_colors: parseColors(str(fd, "brand_colors")),
      budget_total: amount(fd, "budget_total", fail),
      goal_leads: count(fd, "goal_leads", fail),
      goal_bookings: count(fd, "goal_bookings", fail),
      goal_sales_value: amount(fd, "goal_sales_value", fail),
      start_date: start,
      end_date: end,
      notes: optStr(fd, "notes"),
      updated_by: user.id,
    },
    { onConflict: "project_id" },
  );
  finish(error, "plan");
}

// ---------------------------------------------------------------- assets

function assetFields(fd: FormData) {
  return {
    category: oneOf(assetCategories, str(fd, "category")),
    title: str(fd, "title").slice(0, 200),
    description: optStr(fd, "description"),
    language: oneOf(assetLanguages, str(fd, "language")),
    tags: parseTags(str(fd, "tags")),
  };
}

export async function createAsset(fd: FormData) {
  const { supabase, user, project, fail, finish } = await context(fd);
  const fields = assetFields(fd);
  const path = uploadedPath(fd, project.organization_id, project.id);
  if (!fields.category || !fields.title || !path) fail("invalid");
  const { data: asset, error } = await supabase
    .from("marketing_assets")
    .insert({
      ...fields,
      organization_id: project.organization_id,
      project_id: project.id,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !asset) {
    await supabase.storage.from(BUCKET).remove([path!]);
    finish(error ?? { message: "invalid" });
  }
  const { error: fileError } = await supabase.from("marketing_asset_files").insert({
    organization_id: project.organization_id,
    project_id: project.id,
    asset_id: asset!.id,
    version_no: 1,
    path,
    ...fileMeta(fd),
    created_by: user.id,
  });
  if (fileError) {
    await supabase.from("marketing_assets").delete().eq("id", asset!.id);
    await supabase.storage.from(BUCKET).remove([path!]);
  }
  finish(fileError, "asset");
}

export async function addAssetVersion(fd: FormData) {
  const { supabase, user, project, fail, finish } = await context(fd);
  const assetId = str(fd, "asset_id");
  const path = uploadedPath(fd, project.organization_id, project.id);
  if (!path) fail("invalid");
  const { data: last } = await supabase
    .from("marketing_asset_files")
    .select("version_no")
    .eq("asset_id", assetId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("marketing_asset_files").insert({
    organization_id: project.organization_id,
    project_id: project.id,
    asset_id: assetId,
    version_no: (last?.version_no ?? 0) + 1,
    path,
    ...fileMeta(fd),
    note: optStr(fd, "note"),
    created_by: user.id,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path!]);
    finish(error);
  }
  // A new file needs a new review: an approved asset goes back to review.
  await supabase
    .from("marketing_assets")
    .update({ status: "REVIEW" })
    .eq("id", assetId)
    .eq("status", "APPROVED");
  finish(null, "version");
}

export async function updateAsset(fd: FormData) {
  const { supabase, fail, finish } = await context(fd);
  const fields = assetFields(fd);
  if (!fields.category || !fields.title) fail("invalid");
  const { error, count: n } = await supabase
    .from("marketing_assets")
    .update(fields, { count: "exact" })
    .eq("id", str(fd, "asset_id"));
  finish(error ?? (n ? null : { message: "Not authorized" }), "asset");
}

export async function setAssetStatus(fd: FormData) {
  const { supabase, fail, finish } = await context(fd);
  const status = oneOf(assetStatuses, str(fd, "status"));
  if (!status) fail("invalid");
  const { error, count: n } = await supabase
    .from("marketing_assets")
    .update({ status }, { count: "exact" })
    .eq("id", str(fd, "asset_id"));
  finish(error ?? (n ? null : { message: "Not authorized" }), "asset");
}

export async function deleteAsset(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const assetId = str(fd, "asset_id");
  const { data: files } = await supabase
    .from("marketing_asset_files")
    .select("path")
    .eq("asset_id", assetId);
  const { error, count: n } = await supabase
    .from("marketing_assets")
    .delete({ count: "exact" })
    .eq("id", assetId);
  if (!error && n && files?.length) {
    await supabase.storage.from(BUCKET).remove(files.map((f) => f.path));
  }
  finish(error ?? (n ? null : { message: "Not authorized" }), "deleted");
}

// ---------------------------------------------------------------- campaigns

export async function saveCampaign(fd: FormData) {
  const { supabase, user, project, base, fail, finish } = await context(fd);
  const id = str(fd, "campaign_id");
  const start = date(fd, "start_date");
  const end = date(fd, "end_date");
  const codeText = str(fd, "code").toUpperCase().replace(/\s+/g, "-").slice(0, 40);
  const name = str(fd, "name").slice(0, 200);
  if (!codeText || !name || (start && end && end < start)) fail("invalid");
  const row = {
    code: codeText,
    name,
    objective: oneOf(campaignObjectives, str(fd, "objective")) ?? "LEADS",
    status: oneOf(campaignStatuses, str(fd, "status")) ?? "DRAFT",
    start_date: start,
    end_date: end,
    budget: amount(fd, "budget", fail),
    audience: optStr(fd, "audience"),
    key_message: optStr(fd, "key_message"),
    offer: optStr(fd, "offer"),
    channels: pickMany(channels, fd.getAll("channels").map(String)),
    languages: pickMany(copyLanguages, fd.getAll("languages").map(String)),
    lead_tag: optStr(fd, "lead_tag")?.slice(0, 80) ?? codeText,
    goal_leads: count(fd, "goal_leads", fail),
    goal_bookings: count(fd, "goal_bookings", fail),
    notes: optStr(fd, "notes"),
  };
  if (id) {
    const { error, count: n } = await supabase
      .from("marketing_campaigns")
      .update(row, { count: "exact" })
      .eq("id", id);
    finish(error ?? (n ? null : { message: "Not authorized" }), "campaign");
  }
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .insert({
      ...row,
      organization_id: project.organization_id,
      project_id: project.id,
      created_by: user.id,
    })
    .select("id")
    .single();
  finish(error, "campaign", data ? `${base}/campaigns/${data.id}` : undefined);
}

export async function deleteCampaign(fd: FormData) {
  const { supabase, base, finish } = await context(fd);
  const { error, count: n } = await supabase
    .from("marketing_campaigns")
    .delete({ count: "exact" })
    .eq("id", str(fd, "campaign_id"));
  finish(error ?? (n ? null : { message: "Not authorized" }), "deleted", `${base}?view=campaigns`);
}

export async function attachAssets(fd: FormData) {
  const { supabase, project, finish } = await context(fd);
  const campaignId = str(fd, "campaign_id");
  const ids = [...new Set(fd.getAll("asset_id").map(String).filter(Boolean))];
  if (!ids.length) finish(null, "campaign");
  const { error } = await supabase.from("marketing_campaign_assets").upsert(
    ids.map((asset_id) => ({
      campaign_id: campaignId,
      asset_id,
      organization_id: project.organization_id,
      project_id: project.id,
    })),
    { onConflict: "campaign_id,asset_id", ignoreDuplicates: true },
  );
  finish(error, "campaign");
}

export async function detachAsset(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase
    .from("marketing_campaign_assets")
    .delete()
    .eq("campaign_id", str(fd, "campaign_id"))
    .eq("asset_id", str(fd, "asset_id"));
  finish(error, "campaign");
}

// ---------------------------------------------------------------- copies

export async function saveCopy(fd: FormData) {
  const { supabase, user, project, fail, finish } = await context(fd);
  const id = str(fd, "copy_id");
  const body = str(fd, "body");
  if (!body) fail("invalid");
  const row = {
    channel: oneOf(channels, str(fd, "channel")) ?? "OTHER",
    format: oneOf(copyFormats, str(fd, "format")) ?? "POST",
    language: oneOf(copyLanguages, str(fd, "language")) ?? "TH",
    headline: optStr(fd, "headline"),
    body,
    cta: optStr(fd, "cta"),
    hashtags: optStr(fd, "hashtags"),
    visual_idea: optStr(fd, "visual_idea"),
  };
  if (id) {
    const { error, count: n } = await supabase
      .from("marketing_copies")
      .update(row, { count: "exact" })
      .eq("id", id);
    finish(error ?? (n ? null : { message: "Not authorized" }), "copy");
  }
  const { error } = await supabase.from("marketing_copies").insert({
    ...row,
    organization_id: project.organization_id,
    project_id: project.id,
    campaign_id: str(fd, "campaign_id"),
    created_by: user.id,
  });
  finish(error, "copy");
}

export async function setCopyStatus(fd: FormData) {
  const { supabase, fail, finish } = await context(fd);
  const status = oneOf(copyStatuses, str(fd, "status"));
  if (!status) fail("invalid");
  const { error, count: n } = await supabase
    .from("marketing_copies")
    .update({ status }, { count: "exact" })
    .eq("id", str(fd, "copy_id"));
  finish(error ?? (n ? null : { message: "Not authorized" }), "copy");
}

export async function deleteCopy(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error, count: n } = await supabase
    .from("marketing_copies")
    .delete({ count: "exact" })
    .eq("id", str(fd, "copy_id"));
  finish(error ?? (n ? null : { message: "Not authorized" }), "deleted");
}

// ---------------------------------------------------------------- AI draft

const mb = (n: number | null) => (n == null ? null : `${(n / 1_000_000).toFixed(2)} ล้านบาท`);

/**
 * Asks the AI for a campaign concept and copies, using the project's real units, house types,
 * spec highlights and marketing plan. The concept replaces the campaign's; copies are added as
 * AI drafts for the team to edit and approve.
 */
type Client = Awaited<ReturnType<typeof createClient>>;

/** Units, house types, plots and spec highlights as plain lines for an AI prompt. */
async function projectFacts(supabase: Client, projectId: string) {
  const [{ data: units }, { data: spec }] = await Promise.all([
    supabase
      .from("units")
      .select(
        "code,status,list_price,plots(land_area_sqm),house_types(name,bedrooms,bathrooms,gross_floor_area_sqm)",
      )
      .eq("project_id", projectId)
      .order("code"),
    supabase
      .from("spec_items")
      .select("category,area,name,brand,model")
      .eq("project_id", projectId)
      .eq("active", true)
      .in("category", [
        "POOL",
        "KITCHEN",
        "SANITARY",
        "AIRCON",
        "ELECTRICAL",
        "FURNITURE",
        "EXTERIOR",
        "ROOF",
      ])
      .order("seq")
      .limit(40),
  ]);
  const one = <T>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const facts: string[] = [];
  for (const u of units ?? []) {
    const ht = one(u.house_types);
    const plot = one(u.plots);
    facts.push(
      [
        `Unit ${u.code} (${u.status})`,
        ht
          ? `${ht.name}, ${ht.bedrooms ?? "?"} bed / ${ht.bathrooms ?? "?"} bath, ${ht.gross_floor_area_sqm ?? "?"} sq.m.`
          : null,
        plot?.land_area_sqm
          ? `land ${plot.land_area_sqm} sq.m. (${(plot.land_area_sqm / 4).toFixed(1)} ตร.ว.)`
          : null,
        u.list_price ? `list price ${mb(Number(u.list_price))}` : null,
      ]
        .filter(Boolean)
        .join(", "),
    );
  }
  for (const s of spec ?? [])
    facts.push(`Spec: ${[s.area, s.name, s.brand, s.model].filter(Boolean).join(" · ")}`);
  return facts;
}

/**
 * Asks the AI for a campaign concept and copies, using the project's real units, house types,
 * spec highlights and marketing plan. The concept replaces the campaign's; copies are added as
 * AI drafts for the team to edit and approve.
 */
export async function draftCampaignWithAi(fd: FormData) {
  const { supabase, user, project, fail, finish } = await context(fd);
  if (!aiConfigured()) fail("ai_not_configured");
  const campaignId = str(fd, "campaign_id");
  const [{ data: campaign }, { data: plan }, facts] = await Promise.all([
    supabase.from("marketing_campaigns").select("*").eq("id", campaignId).maybeSingle(),
    supabase.from("marketing_plans").select("*").eq("project_id", project.id).maybeSingle(),
    projectFacts(supabase, project.id),
  ]);
  if (!campaign) fail("permission");
  const { data: canEdit } = await supabase.rpc("can_market", {
    target_project: project.id,
    target_action: "EDIT",
  });
  if (!canEdit) fail("permission");

  let errorKey: string | null = null;
  let usage = { input_tokens: 0, output_tokens: 0 };
  try {
    const result = await draftCampaign({
      project: { name: project.name, code: project.code },
      facts,
      plan: {
        project_brief: plan?.raw_brief?.slice(0, 6000) ?? null,
        tagline: plan?.tagline ?? null,
        location: plan?.location_text ?? null,
        website: plan?.website_url ?? null,
        target_audience: plan?.target_audience ?? null,
        personas: plan?.personas ?? null,
        selling_points: plan?.usp ?? null,
        key_message: plan?.key_message ?? null,
        positioning: plan?.positioning ?? null,
        competitors: plan?.competitors ?? null,
        brand_tone: plan?.brand_tone ?? null,
      },
      campaign: {
        name: campaign!.name,
        objective: campaign!.objective,
        dates: [campaign!.start_date, campaign!.end_date].filter(Boolean).join(" to ") || null,
        budget_baht: campaign!.budget,
        audience: campaign!.audience,
        key_message: campaign!.key_message,
        offer: campaign!.offer,
        channels: campaign!.channels?.length ? campaign!.channels : ["FACEBOOK", "INSTAGRAM"],
        languages: campaign!.languages?.length ? campaign!.languages : ["TH", "EN"],
      },
      extra: optStr(fd, "instructions"),
    });
    usage = result.usage;
    const { error } = await supabase
      .from("marketing_campaigns")
      .update({ concept: result.draft.concept })
      .eq("id", campaignId);
    if (error) throw error;
    if (result.draft.copies.length) {
      const { error: copyError } = await supabase.from("marketing_copies").insert(
        result.draft.copies.slice(0, 16).map((c) => ({
          ...c,
          organization_id: project.organization_id,
          project_id: project.id,
          campaign_id: campaignId,
          source: "AI",
          created_by: user.id,
        })),
      );
      if (copyError) throw copyError;
    }
  } catch (e) {
    console.error("marketing AI draft failed", e);
    errorKey =
      e && typeof e === "object" && "code" in e && !(e instanceof Error)
        ? marketingErrorKey((e as { message?: string }).message)
        : `ai_${aiErrorKey(e)}`;
  }
  await supabase.rpc("log_assistant_turn", {
    question_text: `[marketing-draft] ${campaign!.code}`,
    tools_used: ["marketing"],
    tokens_in: usage.input_tokens,
    tokens_out: usage.output_tokens,
    stop: errorKey ? "error" : "end_turn",
  });
  if (errorKey) fail(errorKey);
  finish(null, "aiDraft");
}

// ---------------------------------------------------------------- raw data and AI plan

/** Saves the raw project brief (concept, details, notes) the AI reads before drafting the plan. */
export async function saveRawBrief(fd: FormData) {
  const { supabase, user, project, finish } = await context(fd);
  const { error } = await supabase.from("marketing_plans").upsert(
    {
      organization_id: project.organization_id,
      project_id: project.id,
      raw_brief: optStr(fd, "raw_brief"),
      updated_by: user.id,
    },
    { onConflict: "project_id" },
  );
  finish(error, "plan");
}

const MAX_AI_FILES = 10;
// Base64 grows files by a third; the API takes about 32 MB per request.
const MAX_AI_BYTES = 18 * 1024 * 1024;

/**
 * Drafts the marketing plan with the AI from the raw brief, the project's facts and the chosen
 * files (project data, CI, logo, brochures ...). Fills only empty fields unless "overwrite" is on.
 */
export async function draftPlanWithAi(fd: FormData) {
  const { supabase, user, project, fail, finish } = await context(fd);
  if (!aiConfigured()) fail("ai_not_configured");
  const { data: canEdit } = await supabase.rpc("can_market", {
    target_project: project.id,
    target_action: "EDIT",
  });
  if (!canEdit) fail("permission");
  const overwrite = fd.get("overwrite") === "on";
  const ids = [...new Set(fd.getAll("asset_id").map(String).filter(Boolean))];

  const [{ data: plan }, { data: assets }, facts] = await Promise.all([
    supabase.from("marketing_plans").select("*").eq("project_id", project.id).maybeSingle(),
    ids.length
      ? supabase
          .from("marketing_assets")
          .select(
            "id,title,category,files:marketing_asset_files(path,version_no,file_name,mime_type,size_bytes)",
          )
          .eq("project_id", project.id)
          .in("id", ids)
      : Promise.resolve({ data: [] as never[] }),
    projectFacts(supabase, project.id),
  ]);
  const rawBrief = optStr(fd, "raw_brief") ?? plan?.raw_brief ?? null;

  // Read the latest version of each chosen file the AI can open, within the size budget.
  const files: PlanFile[] = [];
  const skipped: string[] = [];
  let bytes = 0;
  for (const a of assets ?? []) {
    const f = [
      ...((a.files ?? []) as {
        path: string;
        version_no: number;
        file_name: string | null;
        mime_type: string | null;
        size_bytes: number | null;
      }[]),
    ].sort((x, y) => y.version_no - x.version_no)[0];
    const kind = f ? aiReadable(f.mime_type, f.file_name, f.size_bytes) : null;
    const name = `${a.title} [${a.category}]${f?.file_name ? ` ${f.file_name}` : ""}`;
    if (!f || !kind || files.length >= MAX_AI_FILES || bytes + (f.size_bytes ?? 0) > MAX_AI_BYTES) {
      skipped.push(a.title);
      continue;
    }
    const { data: blob } = await supabase.storage.from(BUCKET).download(f.path);
    if (!blob) {
      skipped.push(a.title);
      continue;
    }
    bytes += blob.size;
    if (kind === "text") {
      files.push({ name, kind, text: (await blob.text()).slice(0, 60_000) });
    } else {
      const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
      files.push(
        kind === "image"
          ? { name, kind, media_type: imageMediaType(f.mime_type, f.file_name), data }
          : { name, kind, data },
      );
    }
  }
  if (!files.length && !rawBrief && !facts.length) fail("ai_no_input");

  let errorKey: string | null = null;
  let usage = { input_tokens: 0, output_tokens: 0 };
  try {
    const current = plan
      ? Object.fromEntries(
          Object.entries(plan).filter(
            ([k]) =>
              ![
                "id",
                "organization_id",
                "project_id",
                "updated_by",
                "created_at",
                "updated_at",
                "raw_brief",
                "ai_summary",
                "ai_drafted_at",
              ].includes(k),
          ),
        )
      : null;
    const result = await draftMarketingPlan({
      project: { name: project.name, code: project.code },
      facts,
      notes: rawBrief,
      current,
      files,
    });
    usage = result.usage;
    const d = result.plan;
    const colors = parseColors(d.brand_colors.map((c) => `${c.name} ${c.hex}`).join("\n"));
    const whole = (n: number | null) => (n != null && n >= 0 ? Math.round(n) : null);
    const fields = mergePlan(
      plan,
      {
        tagline: d.tagline,
        location_text: d.location_text,
        website_url: d.website_url,
        target_audience: d.target_audience,
        personas: d.personas,
        usp: d.usp,
        key_message: d.key_message,
        positioning: d.positioning,
        competitors: d.competitors,
        brand_tone: d.brand_tone,
        brand_fonts: d.brand_fonts,
        brand_colors: colors,
        budget_total: whole(d.budget_total),
        goal_leads: whole(d.goal_leads),
        goal_bookings: whole(d.goal_bookings),
        goal_sales_value: whole(d.goal_sales_value),
        notes: d.notes,
      },
      overwrite,
    );
    const summary = [d.summary, skipped.length ? `ไม่ได้อ่าน: ${skipped.join(", ")}` : ""]
      .filter(Boolean)
      .join("\n");
    const { error } = await supabase.from("marketing_plans").upsert(
      {
        ...fields,
        organization_id: project.organization_id,
        project_id: project.id,
        raw_brief: rawBrief,
        ai_summary: summary,
        ai_drafted_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "project_id" },
    );
    if (error) throw error;
  } catch (e) {
    console.error("marketing AI plan failed", e);
    errorKey =
      e && typeof e === "object" && "code" in e && !(e instanceof Error)
        ? marketingErrorKey((e as { message?: string }).message)
        : `ai_${aiErrorKey(e)}`;
  }
  await supabase.rpc("log_assistant_turn", {
    question_text: `[marketing-plan] ${project.code} (${files.length} files)`,
    tools_used: ["marketing"],
    tokens_in: usage.input_tokens,
    tokens_out: usage.output_tokens,
    stop: errorKey ? "error" : "end_turn",
  });
  if (errorKey) fail(errorKey);
  finish(null, "aiPlan");
}
