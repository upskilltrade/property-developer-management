"use server";

import { num, optStr, str } from "@/lib/form";
import { siteContext } from "@/lib/site-actions";
import { procErrorKey } from "@/lib/procurement";

const ctx = (fd: FormData) => siteContext(fd, (locale) => `/${locale}/app/projects`, procErrorKey);

export async function newBudgetVersion(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("create_budget_version", {
    target_project: str(fd, "project_id"),
    note: optStr(fd, "note"),
  });
  finish(error, "budget");
}

export async function saveBoqItem(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("upsert_boq_item", {
    target_version: str(fd, "version_id"),
    target_item: optStr(fd, "item_id"),
    data: {
      cost_category_id: str(fd, "cost_category_id"),
      unit_id: str(fd, "unit_id"),
      item_code: str(fd, "item_code"),
      description: str(fd, "description"),
      uom: str(fd, "uom"),
      quantity: str(fd, "quantity"),
      rate: str(fd, "rate"),
    },
  });
  finish(error, "budget");
}

export async function removeBoqItem(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("remove_boq_item", { target_item: str(fd, "item_id") });
  finish(error, "budget");
}

export async function submitBudget(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("submit_budget_version", {
    target_version: str(fd, "version_id"),
  });
  finish(error, "budget");
}

export async function decideBudget(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("decide_budget_version", {
    target_version: str(fd, "version_id"),
    approve: str(fd, "decision") === "approve",
    note: optStr(fd, "note"),
  });
  finish(error, "decision");
}

export async function setThreshold(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("set_procurement_threshold", {
    target_org: str(fd, "organization_id"),
    amount: num(fd, "amount"),
  });
  finish(error, "saved");
}

/** PR items come in as parallel arrays (item_description[], item_quantity[], ...). */
export async function createRequest(fd: FormData) {
  const { back, supabase, finish } = await ctx(fd);
  const desc = fd.getAll("item_description").map(String);
  const qty = fd.getAll("item_quantity").map(String);
  const uom = fd.getAll("item_uom").map(String);
  const rate = fd.getAll("item_rate").map(String);
  const items = desc
    .map((d, i) => ({ description: d.trim(), quantity: qty[i], uom: uom[i], est_rate: rate[i] }))
    .filter((x) => x.description);
  const { data, error } = await supabase.rpc("create_purchase_request", {
    target_project: str(fd, "project_id"),
    data: {
      title: str(fd, "title"),
      cost_category_id: str(fd, "cost_category_id"),
      unit_id: str(fd, "unit_id"),
      needed_by: str(fd, "needed_by"),
      items,
    },
  });
  finish(error, "request", data ? `${back.split("?")[0]}/requests/${data}` : undefined);
}

export async function decideRequest(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("decide_purchase_request", {
    target_pr: str(fd, "pr_id"),
    approve: str(fd, "decision") === "approve",
    note: optStr(fd, "note"),
  });
  finish(error, "decision");
}

export async function addQuote(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("add_quotation", {
    target_pr: str(fd, "pr_id"),
    data: {
      partner_id: str(fd, "partner_id"),
      quote_ref: str(fd, "quote_ref"),
      amount: str(fd, "amount"),
      lead_time_days: str(fd, "lead_time_days"),
      valid_until: str(fd, "valid_until"),
      notes: str(fd, "notes"),
    },
  });
  finish(error, "quote");
}

export async function createPo(fd: FormData) {
  const { locale, supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("create_po_from_quotation", {
    target_quotation: str(fd, "quotation_id"),
    data: { delivery_due: str(fd, "delivery_due"), terms: str(fd, "terms") },
  });
  finish(
    error,
    "order",
    `/${locale}/app/projects/${str(fd, "project_id")}/procurement?view=orders`,
  );
}

export async function decideOrder(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("decide_purchase_order", {
    target_po: str(fd, "po_id"),
    approve: str(fd, "decision") === "approve",
    note: optStr(fd, "note"),
  });
  finish(error, "decision");
}

export async function receiveOrder(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("receive_purchase_order", {
    target_po: str(fd, "po_id"),
    data: {
      amount: str(fd, "amount"),
      inspection: str(fd, "inspection"),
      received_on: str(fd, "received_on"),
      note: str(fd, "note"),
    },
  });
  finish(error, "received");
}

export async function cancelOrder(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("cancel_purchase_order", {
    target_po: str(fd, "po_id"),
    reason: str(fd, "reason"),
  });
  finish(error, "cancel");
}

export async function submitClaim(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("submit_progress_claim", {
    target_project: str(fd, "project_id"),
    data: {
      partner_id: str(fd, "partner_id"),
      cost_category_id: str(fd, "cost_category_id"),
      claimed_amount: str(fd, "claimed_amount"),
      period_end: str(fd, "period_end"),
      note: str(fd, "note"),
    },
  });
  finish(error, "claim");
}

export async function certifyClaim(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("certify_progress_claim", {
    target_claim: str(fd, "claim_id"),
    certified: num(fd, "certified"),
    note: optStr(fd, "note"),
  });
  finish(error, "decision");
}
