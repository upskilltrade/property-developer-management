"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formLocale, num, optStr, str, withFlash } from "@/lib/form";

/** Maps RPC exceptions to flash keys the toast can explain. */
function errorKey(message: string | undefined) {
  if (!message) return "payment";
  if (message.includes("Not authorized")) return "permission";
  if (message.includes("no customer")) return "noCustomerForSchedule";
  if (message.includes("already has payments")) return "scheduleHasPayments";
  if (message.includes("cannot verify their own")) return "selfVerifyPayment";
  if (message.includes("Evidence file")) return "evidenceRequired";
  if (/Invalid|required/.test(message)) return "invalid";
  return "payment";
}

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
  const back = `/${locale}/app/projects/${projectId}/units/${unitId}/payments`;
  const finish = (error: { message?: string } | null, key: string): never => {
    if (error) redirect(withFlash(back, "error", errorKey(error.message)));
    revalidatePath(`/${locale}/app`, "layout");
    redirect(withFlash(back, "saved", key));
  };
  return { unitId, supabase, back, finish };
}

export async function setPaymentSchedule(fd: FormData) {
  const { unitId, supabase, back, finish } = await context(fd);
  let items: unknown;
  try {
    items = JSON.parse(str(fd, "items") || "[]");
  } catch {
    redirect(withFlash(back, "error", "invalid"));
  }
  const { error } = await supabase.rpc("set_payment_schedule", { target_unit: unitId, items });
  finish(error, "schedule");
}

export async function verifyEvidence(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("verify_payment_evidence", {
    target_evidence: str(fd, "evidence_id"),
    amount: num(fd, "amount"),
    paid_on: optStr(fd, "paid_on"),
    note: optStr(fd, "note"),
  });
  finish(error, "verify");
}

export async function rejectEvidence(fd: FormData) {
  const { supabase, back, finish } = await context(fd);
  const note = str(fd, "note");
  if (!note) redirect(withFlash(back, "error", "invalid"));
  const { error } = await supabase.rpc("reject_payment_evidence", {
    target_evidence: str(fd, "evidence_id"),
    note,
  });
  finish(error, "reject");
}

export async function recordPayment(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("record_payment", {
    target_schedule: str(fd, "schedule_id"),
    amount: num(fd, "amount"),
    paid_on: optStr(fd, "paid_on"),
    method: str(fd, "method"),
    reference: optStr(fd, "reference"),
  });
  finish(error, "payment");
}

export async function reversePayment(fd: FormData) {
  const { supabase, back, finish } = await context(fd);
  const reason = str(fd, "reason");
  if (!reason) redirect(withFlash(back, "error", "invalid"));
  const { error } = await supabase.rpc("reverse_payment", {
    target_payment: str(fd, "payment_id"),
    reason,
  });
  finish(error, "reverse");
}
