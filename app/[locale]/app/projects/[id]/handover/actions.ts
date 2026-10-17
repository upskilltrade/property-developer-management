"use server";

import { optStr, str } from "@/lib/form";
import { siteContext } from "@/lib/site-actions";
import { handoverErrorKey } from "@/lib/handover";
import { fromLocalDateTime } from "@/lib/sales";

const ctx = (fd: FormData) =>
  siteContext(fd, (locale) => `/${locale}/app/projects`, handoverErrorKey);

export async function markReady(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("mark_handover_ready", { target_unit: str(fd, "unit_id") });
  finish(error, "handover");
}

export async function scheduleInspection(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("schedule_customer_inspection", {
    target_unit: str(fd, "unit_id"),
    scheduled_at: fromLocalDateTime(str(fd, "scheduled_at")),
  });
  finish(error, "handover");
}

/** Checklist results arrive as item_text[] + item_result[] + item_note[] + item_severity[]. */
export async function recordInspection(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const text = fd.getAll("item_text").map(String);
  const result = fd.getAll("item_result").map(String);
  const note = fd.getAll("item_note").map(String);
  const severity = fd.getAll("item_severity").map(String);
  const items = text
    .map((item, i) => ({
      item: item.trim(),
      result: result[i] || "PASS",
      note: note[i],
      severity: severity[i],
    }))
    .filter((x) => x.item);
  const { error } = await supabase.rpc("record_checklist_inspection", {
    target_project: str(fd, "project_id"),
    data: {
      unit_id: str(fd, "unit_id"),
      title: str(fd, "title"),
      purpose: str(fd, "purpose"),
      customer_visible: fd.get("customer_visible") === "on",
      assigned_partner_id: str(fd, "assigned_partner_id"),
      items,
    },
  });
  finish(error, "inspection");
}

export async function logCustomerDefect(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("log_customer_defect", {
    target_unit: str(fd, "unit_id"),
    title: str(fd, "title"),
    description: optStr(fd, "description"),
    location: optStr(fd, "location"),
  });
  finish(error, "defect");
}

export async function acceptHandover(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("accept_handover", { target_unit: str(fd, "unit_id") });
  finish(error, "handover");
}

export async function addItem(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("add_handover_item", {
    target_unit: str(fd, "unit_id"),
    data: {
      kind: str(fd, "kind"),
      description: str(fd, "description"),
      quantity: str(fd, "quantity"),
      reference: str(fd, "reference"),
      file_path: str(fd, "file_path"),
    },
  });
  finish(error, "item");
}

export async function setDelivered(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("set_handover_item_delivered", {
    target_item: str(fd, "item_id"),
    delivered: str(fd, "delivered") === "true",
  });
  finish(error, "item");
}

export async function completeHandover(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("complete_handover", {
    target_unit: str(fd, "unit_id"),
    handover_date: str(fd, "handover_date"),
    transfer_date: optStr(fd, "transfer_date"),
    acknowledgement_path: optStr(fd, "file_path"),
  });
  finish(error, "handover");
}

export async function saveWarrantyType(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("save_warranty_type", {
    target_org: str(fd, "organization_id"),
    data: {
      code: str(fd, "code"),
      name_th: str(fd, "name_th"),
      name_en: str(fd, "name_en"),
      months: str(fd, "months"),
      default_partner_id: str(fd, "default_partner_id"),
      terms: str(fd, "terms"),
    },
  });
  finish(error, "warranty");
}

export async function saveChecklist(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const items = str(fd, "items")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((item) => ({ item }));
  const { error } = await supabase.rpc("save_checklist_template", {
    target_org: str(fd, "organization_id"),
    data: { code: str(fd, "code"), name: str(fd, "name"), purpose: str(fd, "purpose"), items },
  });
  finish(error, "checklist");
}

export async function assignService(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("assign_service_request", {
    target_sr: str(fd, "sr_id"),
    target_partner: optStr(fd, "partner_id"),
    due_date: optStr(fd, "due_date"),
  });
  finish(error, "service");
}

export async function updateService(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("update_service_request", {
    target_sr: str(fd, "sr_id"),
    action: str(fd, "action"),
    note: optStr(fd, "note"),
  });
  finish(error, "service");
}
