"use server";

import { optStr, str } from "@/lib/form";
import { siteContext } from "@/lib/site-actions";
import { voErrorKey } from "@/lib/variations";

const ctx = (fd: FormData) => siteContext(fd, (locale) => `/${locale}/app/projects`, voErrorKey);

const voData = (fd: FormData) => ({
  title: str(fd, "title"),
  unit_id: str(fd, "unit_id"),
  change_request_id: str(fd, "change_request_id"),
  original_scope: str(fd, "original_scope"),
  revised_scope: str(fd, "revised_scope"),
  cost_delta: str(fd, "cost_delta"),
  price_delta: str(fd, "price_delta"),
  time_delta_days: str(fd, "time_delta_days"),
  partner_id: str(fd, "partner_id"),
  note: str(fd, "note"),
  customer_facing: fd.get("customer_facing") === "on",
  requires_payment_before_release: fd.get("requires_payment_before_release") === "on",
  payment_due_days: str(fd, "payment_due_days"),
});

export async function logRequest(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("submit_change_request", {
    target_project: str(fd, "project_id"),
    data: {
      unit_id: str(fd, "unit_id"),
      source: str(fd, "source"),
      title: str(fd, "title"),
      description: str(fd, "description"),
    },
  });
  finish(error, "request");
}

export async function decideRequest(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("decide_change_request", {
    target_cr: str(fd, "cr_id"),
    decision: str(fd, "decision"),
    note: optStr(fd, "note"),
  });
  finish(error, "request");
}

export async function createVariation(fd: FormData) {
  const { back, supabase, finish } = await ctx(fd);
  const { data, error } = await supabase.rpc("create_variation", {
    target_project: str(fd, "project_id"),
    data: voData(fd),
  });
  finish(error, "variation", data ? `${back.split("?")[0]}/${data}` : undefined);
}

export async function reviseVariation(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("revise_variation", {
    target_vo: str(fd, "vo_id"),
    data: voData(fd),
  });
  finish(error, "variation");
}

export async function linkDrawing(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("link_variation_drawing", {
    target_vo: str(fd, "vo_id"),
    target_revision: optStr(fd, "revision_id"),
  });
  finish(error, "variation");
}

export async function submitVariation(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("submit_variation", { target_vo: str(fd, "vo_id") });
  finish(error, "variation");
}

export async function approveVariation(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("approve_variation_internal", {
    target_vo: str(fd, "vo_id"),
    approve: str(fd, "decision") === "approve",
    comment: optStr(fd, "comment"),
  });
  finish(error, "decision");
}

export async function releaseVariation(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("release_variation", { target_vo: str(fd, "vo_id") });
  finish(error, "release");
}

export async function closeVariation(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("close_variation", {
    target_vo: str(fd, "vo_id"),
    cancel: str(fd, "mode") === "cancel",
    reason: optStr(fd, "reason"),
  });
  finish(error, "variation");
}
