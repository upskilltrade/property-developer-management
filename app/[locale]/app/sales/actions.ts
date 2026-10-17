"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formLocale, num, optStr, str, withFlash } from "@/lib/form";
import { fromLocalDateTime } from "@/lib/sales";

/** Maps RPC exceptions to flash keys the toast can explain. */
function errorKey(message: string | undefined) {
  if (!message) return "sales";
  if (message.includes("Not authorized")) return "permission";
  if (message.includes("not available")) return "unitUnavailable";
  if (message.includes("Discount reason")) return "discountReason";
  if (message.includes("closed") || message.includes("is booked")) return "leadClosed";
  if (message.includes("cannot approve their own")) return "selfApprove";
  if (message.includes("has payments")) return "bookingHasPayments";
  if (message.includes("has contract")) return "bookingHasContract";
  if (message.includes("below approved price")) return "priceBelowApproved";
  if (message.includes("Change note")) return "changeNote";
  if (message.includes("cannot be changed")) return "contractLocked";
  if (message.includes("file not uploaded")) return "contractFile";
  if (message.includes("Contact required")) return "contactRequired";
  if (/Invalid|required|duplicate key/.test(message))
    return message.includes("duplicate") ? "unitUnavailable" : "invalid";
  return "sales";
}

async function context(fd: FormData) {
  const locale = formLocale(fd);
  const fallback = `/${locale}/app/sales`;
  const requested = str(fd, "return_to");
  const back = requested.startsWith(`${fallback}`) ? requested : fallback;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  const finish = (error: { message?: string } | null, key: string, to = back): never => {
    if (error) redirect(withFlash(back, "error", errorKey(error.message)));
    revalidatePath(`/${locale}/app`, "layout");
    redirect(withFlash(to, "saved", key));
  };
  return { locale, supabase, back, finish };
}

const leadData = (fd: FormData) => ({
  full_name: str(fd, "full_name"),
  phone: str(fd, "phone"),
  email: str(fd, "email"),
  line_id: str(fd, "line_id"),
  source: str(fd, "source"),
  campaign: str(fd, "campaign"),
  budget: str(fd, "budget"),
  interested_unit_id: str(fd, "interested_unit_id"),
  assigned_to: str(fd, "assigned_to"),
  notes: str(fd, "notes"),
});

export async function createLead(fd: FormData) {
  const { locale, supabase, finish } = await context(fd);
  const { data, error } = await supabase.rpc("create_lead", {
    target_project: str(fd, "project_id"),
    data: leadData(fd),
  });
  finish(error, "lead", data ? `/${locale}/app/sales/leads/${data}` : undefined);
}

export async function updateLead(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("update_lead", {
    target_lead: str(fd, "lead_id"),
    data: leadData(fd),
  });
  finish(error, "lead");
}

export async function setLeadStage(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("set_lead_stage", {
    target_lead: str(fd, "lead_id"),
    new_stage: str(fd, "stage"),
    reason: optStr(fd, "reason"),
  });
  finish(error, "stage");
}

export async function addActivity(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("add_lead_activity", {
    target_lead: str(fd, "lead_id"),
    kind: str(fd, "kind"),
    note: str(fd, "note"),
    occurred_at: null,
  });
  finish(error, "activity");
}

export async function scheduleViewing(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("schedule_viewing", {
    target_lead: str(fd, "lead_id"),
    target_unit: optStr(fd, "unit_id"),
    scheduled_at: fromLocalDateTime(str(fd, "scheduled_at")),
    note: optStr(fd, "note"),
  });
  finish(error, "viewing");
}

export async function setViewingStatus(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("set_viewing_status", {
    target_viewing: str(fd, "viewing_id"),
    new_status: str(fd, "status"),
    note: optStr(fd, "note"),
  });
  finish(error, "viewing");
}

export async function holdUnit(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("hold_unit", {
    target_lead: str(fd, "lead_id"),
    target_unit: str(fd, "unit_id"),
    expires_at: fromLocalDateTime(str(fd, "expires_at")),
    note: optStr(fd, "note"),
  });
  finish(error, "hold");
}

export async function releaseHold(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("release_hold", {
    target_hold: str(fd, "hold_id"),
    reason: optStr(fd, "reason"),
  });
  finish(error, "release");
}

export async function createBooking(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("create_booking", {
    target_lead: str(fd, "lead_id"),
    target_unit: str(fd, "unit_id"),
    agreed_price: num(fd, "agreed_price"),
    booking_amount: num(fd, "booking_amount") ?? 0,
    booking_date: optStr(fd, "booking_date"),
    discount_reason: optStr(fd, "discount_reason"),
  });
  finish(error, "booking");
}

export async function decideBooking(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("decide_booking", {
    target_booking: str(fd, "booking_id"),
    approve: str(fd, "decision") === "approve",
    note: optStr(fd, "note"),
  });
  finish(error, "decision");
}

export async function cancelBooking(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("cancel_booking", {
    target_booking: str(fd, "booking_id"),
    reason: str(fd, "reason"),
  });
  finish(error, "cancel");
}

const contractData = (fd: FormData) => ({
  contract_price: str(fd, "contract_price"),
  down_payment: str(fd, "down_payment"),
  installment_count: str(fd, "installment_count"),
  transfer_due: str(fd, "transfer_due"),
  language: str(fd, "language"),
  terms: str(fd, "terms"),
  change_note: str(fd, "change_note"),
});

export async function createContract(fd: FormData) {
  const { locale, supabase, finish } = await context(fd);
  const { data, error } = await supabase.rpc("create_contract", {
    target_booking: str(fd, "booking_id"),
    data: contractData(fd),
  });
  finish(error, "contract", data ? `/${locale}/app/sales/contracts/${data}` : undefined);
}

export async function reviseContract(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("revise_contract", {
    target_contract: str(fd, "contract_id"),
    data: contractData(fd),
  });
  finish(error, "contract");
}

export async function signContract(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("sign_contract", {
    target_contract: str(fd, "contract_id"),
    signed_on: str(fd, "signed_on"),
    file_path: optStr(fd, "file_path"),
  });
  finish(error, "signed");
}

export async function cancelContract(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("cancel_contract", {
    target_contract: str(fd, "contract_id"),
    reason: str(fd, "reason"),
  });
  finish(error, "cancel");
}

export async function updateCustomer(fd: FormData) {
  const { supabase, finish } = await context(fd);
  const { error } = await supabase.rpc("update_customer", {
    target_customer: str(fd, "customer_id"),
    data: {
      full_name: str(fd, "full_name"),
      phone: str(fd, "phone"),
      email: str(fd, "email"),
      nationality: str(fd, "nationality"),
      notes: str(fd, "notes"),
    },
  });
  finish(error, "customer");
}
