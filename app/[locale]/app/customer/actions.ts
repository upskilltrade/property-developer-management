"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formLocale, num, optStr, str, withFlash } from "@/lib/form";

/** Customer reports a payment with an uploaded slip; Finance verifies it later. */
export async function submitPaymentEvidence(fd: FormData) {
  const locale = formLocale(fd);
  const back = `/${locale}/app/customer`;
  const supabase = await createClient();
  const filePath = str(fd, "file_path");
  if (!filePath) redirect(withFlash(back, "error", "evidenceRequired"));
  const { error } = await supabase.rpc("submit_payment_evidence", {
    target_schedule: str(fd, "schedule_id"),
    amount: num(fd, "amount"),
    paid_on: optStr(fd, "paid_on"),
    method: str(fd, "method") || "TRANSFER",
    reference: optStr(fd, "reference"),
    note: optStr(fd, "note"),
    file_path: filePath,
  });
  if (error)
    redirect(
      withFlash(
        back,
        "error",
        error.message.includes("Evidence file") ? "evidenceRequired" : "invalid",
      ),
    );
  revalidatePath(back);
  redirect(withFlash(back, "saved", "evidence"));
}

/** Customer approves, or requests a change to, a released drawing revision or a published selection. */
export async function decideDesign(fd: FormData) {
  const locale = formLocale(fd);
  const back = `/${locale}/app/customer`;
  const supabase = await createClient();
  const { error } = await supabase.rpc("customer_decide", {
    entity_type: str(fd, "entity_type"),
    entity_id: str(fd, "entity_id"),
    decision: str(fd, "decision") === "approve" ? "APPROVED" : "CHANGE_REQUESTED",
    comment: optStr(fd, "comment"),
  });
  if (error)
    redirect(
      withFlash(back, "error", error.message.includes("Comment") ? "commentRequired" : "invalid"),
    );
  revalidatePath(back);
  redirect(withFlash(back, "saved", "decision"));
}

/** Customer asks for a change on their unit; staff price it as a variation order. */
export async function requestChange(fd: FormData) {
  const locale = formLocale(fd);
  const back = `/${locale}/app/customer`;
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_change_request", {
    target_project: null,
    data: {
      unit_id: str(fd, "unit_id"),
      title: str(fd, "title"),
      description: str(fd, "description"),
    },
  });
  if (error) redirect(withFlash(back, "error", "invalid"));
  revalidatePath(back);
  redirect(withFlash(back, "saved", "request"));
}

/** Customer approves or declines the offered variation version. */
export async function decideVariation(fd: FormData) {
  const locale = formLocale(fd);
  const back = `/${locale}/app/customer`;
  const supabase = await createClient();
  const { error } = await supabase.rpc("customer_decide_variation", {
    target_vo: str(fd, "vo_id"),
    approve: str(fd, "decision") === "approve",
    comment: optStr(fd, "comment"),
  });
  if (error)
    redirect(
      withFlash(back, "error", error.message.includes("Comment") ? "commentRequired" : "invalid"),
    );
  revalidatePath(back);
  redirect(withFlash(back, "saved", "decision"));
}

/** Homeowner: during customer inspection, report observations and accept the home. */
export async function reportObservation(fd: FormData) {
  const locale = formLocale(fd);
  const back = `/${locale}/app/customer`;
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_customer_defect", {
    target_unit: str(fd, "unit_id"),
    title: str(fd, "title"),
    description: optStr(fd, "description"),
    location: optStr(fd, "location"),
  });
  if (error) redirect(withFlash(back, "error", "invalid"));
  revalidatePath(back);
  redirect(withFlash(back, "saved", "defect"));
}

export async function acceptHome(fd: FormData) {
  const locale = formLocale(fd);
  const back = `/${locale}/app/customer`;
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_handover", { target_unit: str(fd, "unit_id") });
  if (error)
    redirect(
      withFlash(
        back,
        "error",
        error.message.includes("defects") ? "customerDefects" : "handoverStep",
      ),
    );
  revalidatePath(back);
  redirect(withFlash(back, "saved", "handover"));
}

/** Homeowner after-sales: raise a repair and confirm or reopen it once resolved. */
export async function requestService(fd: FormData) {
  const locale = formLocale(fd);
  const back = `/${locale}/app/customer`;
  const supabase = await createClient();
  const { error } = await supabase.rpc("raise_service_request", {
    target_unit: str(fd, "unit_id"),
    data: {
      title: str(fd, "title"),
      description: str(fd, "description"),
      location: str(fd, "location"),
      warranty_id: str(fd, "warranty_id"),
    },
  });
  if (error) redirect(withFlash(back, "error", "invalid"));
  revalidatePath(back);
  redirect(withFlash(back, "saved", "service"));
}

export async function confirmService(fd: FormData) {
  const locale = formLocale(fd);
  const back = `/${locale}/app/customer`;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_service_request", {
    target_sr: str(fd, "sr_id"),
    action: str(fd, "action") === "REOPEN" ? "REOPEN" : "CLOSE",
    note: optStr(fd, "note"),
  });
  if (error) redirect(withFlash(back, "error", "invalid"));
  revalidatePath(back);
  redirect(withFlash(back, "saved", "service"));
}
