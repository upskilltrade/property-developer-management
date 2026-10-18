"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formLocale, num, optStr, str, withFlash } from "@/lib/form";
import { toNumber } from "@/lib/format";
import {
  AI_MODEL,
  aiConfigured,
  aiErrorKey,
  imageTypes,
  reviewProgressPhotos,
  type AiImage,
  type ReviewDocument,
} from "@/lib/ai";

/** Maps RPC exceptions to flash keys the toast can explain. */
function errorKey(message: string | undefined) {
  if (!message) return "schedule";
  if (message.includes("Not authorized")) return "permission";
  if (message.includes("cannot verify their own")) return "selfVerify";
  if (message.includes("photo")) return "photosRequired";
  if (message.includes("already has a schedule")) return "hasSchedule";
  if (/Percent|Invalid|required/.test(message)) return "invalid";
  return "schedule";
}

async function context(fd: FormData) {
  const locale = formLocale(fd);
  const projectId = str(fd, "project_id");
  if (!projectId) redirect(`/${locale}/app/projects`);
  const projectBase = `/${locale}/app/projects/${projectId}`;
  // Only return to pages inside this project.
  const requested = str(fd, "return_to");
  const back = requested.startsWith(`${projectBase}/`) ? requested : `${projectBase}/schedule`;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  const finish = (error: { message?: string } | null, key: string): never => {
    if (error) redirect(withFlash(back, "error", errorKey(error.message)));
    revalidatePath(projectBase, "layout");
    redirect(withFlash(back, "saved", key));
  };
  return { supabase, back, finish };
}

export async function applyScheduleTemplate(fd: FormData) {
  const { supabase, back, finish } = await context(fd);
  const unitId = str(fd, "unit_id");
  const templateId = str(fd, "template_id");
  const startDate = str(fd, "start_date");
  if (!unitId || !templateId || !startDate) redirect(withFlash(back, "error", "invalid"));
  const { error } = await supabase.rpc("apply_schedule_template", {
    target_unit: unitId,
    target_template: templateId,
    start_date: startDate,
  });
  finish(error, "template");
}

type UploadedPhoto = { path: string; thumb?: string; caption?: string; taken_at?: string };

export async function reportProgress(fd: FormData) {
  const { supabase, back, finish } = await context(fd);
  const percent = num(fd, "percent");
  if (percent == null || percent < 0 || percent > 100)
    redirect(withFlash(back, "error", "invalid"));
  let photos: UploadedPhoto[] = [];
  try {
    const parsed = JSON.parse(str(fd, "photos") || "[]");
    photos = Array.isArray(parsed) ? parsed.filter((p) => typeof p?.path === "string") : [];
  } catch {
    redirect(withFlash(back, "error", "photosRequired"));
  }
  const { error } = await supabase.rpc("report_progress", {
    target_activity: str(fd, "activity_id"),
    percent,
    note: optStr(fd, "note"),
    report_date: optStr(fd, "report_date"),
    photos,
  });
  finish(error, "report");
}

export async function verifyProgress(fd: FormData) {
  const { supabase, back, finish } = await context(fd);
  const percent = num(fd, "percent");
  if (percent == null || percent < 0 || percent > 100)
    redirect(withFlash(back, "error", "invalid"));
  const { error } = await supabase.rpc("verify_progress", {
    target_update: str(fd, "update_id"),
    percent,
    note: optStr(fd, "note"),
  });
  finish(error, "verify");
}

export async function publishProgress(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("publish_progress", {
    target_update: str(fd, "update_id"),
    photo_ids: fd.getAll("photo_id").map(String),
  });
  finish(error, "publish");
}

export async function updateForecast(fd: FormData) {
  const { supabase, back, finish } = await context(fd);
  const start = str(fd, "forecast_start");
  const end = str(fd, "forecast_finish");
  if (!start || !end || end < start) redirect(withFlash(back, "error", "invalid"));
  const { error } = await supabase.rpc("update_activity_forecast", {
    target_activity: str(fd, "activity_id"),
    new_start: start,
    new_finish: end,
  });
  finish(error, "forecast");
}

export async function voidPhoto(fd: FormData) {
  const { supabase, back, finish } = await context(fd);
  const reason = str(fd, "reason");
  if (!reason) redirect(withFlash(back, "error", "invalid"));
  const { error } = await supabase.rpc("void_activity_photo", {
    target_photo: str(fd, "photo_id"),
    reason,
  });
  finish(error, "void");
}

const MAX_REVIEW_PHOTOS = 6;
const MAX_PHOTO_BYTES = 4_500_000;
const MAX_REVIEW_DOCS = 4;
const MAX_DOC_BYTES = 20_000_000;

/**
 * Second opinion from AI on whether the photos support the reported percent. Only verifiers may
 * run it (save_photo_review checks), and the result is advice: verification stays manual.
 */
export async function reviewPhotosWithAi(fd: FormData) {
  const { supabase, back } = await context(fd);
  const fail = (key: string): never => redirect(withFlash(back, "error", `ai_${key}`));
  if (!aiConfigured()) fail("not_configured");
  const updateId = str(fd, "update_id");
  const { data: canApprove } = await supabase.rpc("can_schedule", {
    target_project: str(fd, "project_id"),
    target_action: "APPROVE",
  });
  if (canApprove !== true) redirect(withFlash(back, "error", "permission"));

  const [{ data: update }, { data: photos }] = await Promise.all([
    supabase
      .from("progress_updates")
      .select(
        "id,reported_percent,note,schedule_activities(name_th,name_en,stage,verified_percent)",
      )
      .eq("id", updateId)
      .maybeSingle(),
    supabase
      .from("activity_photos")
      .select("storage_path")
      .eq("progress_update_id", updateId)
      .is("voided_at", null)
      .order("uploaded_at")
      .limit(MAX_REVIEW_PHOTOS),
  ]);
  if (!update) redirect(withFlash(back, "error", "invalid"));
  const images: AiImage[] = [];
  for (const p of photos ?? []) {
    const { data: blob } = await supabase.storage.from("site-photos").download(p.storage_path);
    if (!blob || blob.size > MAX_PHOTO_BYTES || !imageTypes.has(blob.type)) continue;
    images.push({
      media_type: blob.type as AiImage["media_type"],
      data: Buffer.from(await blob.arrayBuffer()).toString("base64"),
    });
  }
  if (!images.length) fail("no_photos");

  // Verified documents for this kind of work: the project's specification and contract first,
  // then technical standards. Only documents with an attached file can be read by the model.
  const stage = (
    Array.isArray(update.schedule_activities)
      ? update.schedule_activities[0]
      : update.schedule_activities
  )?.stage as string | undefined;
  const projectId = str(fd, "project_id");
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) redirect(withFlash(back, "error", "invalid"));
  const { data: docRows } = await supabase
    .from("inspection_standards")
    .select("id,code,title,doc_type,file_path,stages,project_id")
    .eq("status", "VERIFIED")
    .not("file_path", "is", null)
    .or(`project_id.is.null,project_id.eq.${projectId}`)
    .limit(50);
  const rank = { PROJECT_SPEC: 0, CONTRACT: 1, STANDARD: 2 } as Record<string, number>;
  const applicable = (docRows ?? [])
    .filter((d) => !d.stages?.length || (stage && d.stages.includes(stage)))
    .sort((a, b) => (rank[a.doc_type] ?? 9) - (rank[b.doc_type] ?? 9));
  const documents: ReviewDocument[] = [];
  let docBytes = 0;
  for (const d of applicable) {
    if (documents.length >= MAX_REVIEW_DOCS) break;
    const { data: blob } = await supabase.storage.from("standard-docs").download(d.file_path!);
    if (!blob || docBytes + blob.size > MAX_DOC_BYTES) continue;
    docBytes += blob.size;
    documents.push({
      code: d.code,
      title: d.title,
      docType: d.doc_type,
      media_type: "application/pdf",
      data: Buffer.from(await blob.arrayBuffer()).toString("base64"),
    });
  }

  const activity = (
    Array.isArray(update.schedule_activities)
      ? update.schedule_activities[0]
      : update.schedule_activities
  ) as {
    name_th: string;
    name_en: string;
    stage: string;
    verified_percent: unknown;
  } | null;
  let result: Awaited<ReturnType<typeof reviewProgressPhotos>> | null = null;
  let errorKeyAi: string | null = null;
  try {
    result = await reviewProgressPhotos({
      activity: `${activity?.name_th ?? ""} / ${activity?.name_en ?? ""}`,
      stage: activity?.stage ?? "",
      reportedPercent: toNumber(update.reported_percent),
      previousVerified: toNumber(activity?.verified_percent),
      note: update.note,
      images,
      documents,
    });
  } catch (e) {
    console.error("photo review failed", e);
    errorKeyAi = aiErrorKey(e);
  }
  await supabase.rpc("log_assistant_turn", {
    question_text: `[photo-review] ${updateId}`,
    tools_used: ["photo_review"],
    tokens_in: result?.usage.input_tokens ?? 0,
    tokens_out: result?.usage.output_tokens ?? 0,
    stop: result ? "end_turn" : (errorKeyAi ?? "error"),
  });
  if (!result) return fail(errorKeyAi ?? "generic");
  const { error } = await supabase.rpc("save_photo_review", {
    target_update: updateId,
    review: {
      ...result.review,
      photo_count: images.length,
      model: AI_MODEL,
      documents: documents.map((d) => ({ code: d.code, title: d.title, doc_type: d.docType })),
    },
  });
  if (error) redirect(withFlash(back, "error", errorKey(error.message)));
  revalidatePath(back);
  redirect(withFlash(back, "saved", "aiReview"));
}
