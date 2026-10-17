"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formLocale, num, optStr, str, withFlash } from "@/lib/form";

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
