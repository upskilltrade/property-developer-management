"use server";

import { redirect } from "next/navigation";
import { num, optStr, str, withFlash } from "@/lib/form";
import { siteContext } from "@/lib/site-actions";

const ctx = (fd: FormData) => siteContext(fd, (locale) => `/${locale}/app/contractor`);

type UploadedPhoto = { path: string; thumb?: string; caption?: string; taken_at?: string };

/** Contractor progress report on an assigned activity; it stays "reported" until site staff verify it. */
export async function reportProgress(fd: FormData) {
  const { supabase, back, finish } = await ctx(fd);
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

export async function raiseRfi(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("raise_rfi", {
    target_project: str(fd, "project_id"),
    data: {
      subject: str(fd, "subject"),
      question: str(fd, "question"),
      unit_id: str(fd, "unit_id"),
      drawing_id: str(fd, "drawing_id"),
      due_date: str(fd, "due_date"),
    },
  });
  finish(error, "rfi");
}

export async function replyRfi(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("respond_rfi", {
    target_rfi: str(fd, "rfi_id"),
    body: str(fd, "body"),
    is_answer: false,
  });
  finish(error, "rfi");
}

export async function updateInstruction(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("update_site_instruction", {
    target_si: str(fd, "si_id"),
    action: str(fd, "action"),
    note: optStr(fd, "note"),
  });
  finish(error, "instruction");
}

export async function fixDefect(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("update_defect", {
    target_defect: str(fd, "defect_id"),
    action: "FIX",
    note: optStr(fd, "note"),
  });
  finish(error, "defect");
}

export async function submitSiteReport(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("submit_site_report", {
    target_project: str(fd, "project_id"),
    data: {
      report_date: str(fd, "report_date"),
      weather: str(fd, "weather"),
      manpower: String(num(fd, "manpower") ?? 0),
      work_summary: str(fd, "work_summary"),
      issues: str(fd, "issues"),
    },
  });
  finish(error, "report");
}
