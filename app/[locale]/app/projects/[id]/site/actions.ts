"use server";

import { num, optStr, str } from "@/lib/form";
import { siteContext } from "@/lib/site-actions";

const ctx = (fd: FormData) => siteContext(fd, (locale) => `/${locale}/app/projects`);

export async function savePartner(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("upsert_partner", {
    target_org: str(fd, "organization_id"),
    target_partner: optStr(fd, "partner_id"),
    data: {
      name: str(fd, "name"),
      partner_type: str(fd, "partner_type"),
      tax_ref: str(fd, "tax_ref"),
      phone: str(fd, "phone"),
      email: str(fd, "email"),
    },
  });
  finish(error, "partner");
}

export async function addContact(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("add_partner_contact", {
    target_partner: str(fd, "partner_id"),
    data: {
      full_name: str(fd, "full_name"),
      phone: str(fd, "phone"),
      email: str(fd, "email"),
      role: str(fd, "role"),
      profile_id: str(fd, "profile_id"),
    },
  });
  finish(error, "contact");
}

export async function assignPartner(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("assign_partner", {
    target_project: str(fd, "project_id"),
    target_partner: str(fd, "partner_id"),
    target_unit: optStr(fd, "unit_id"),
    scope: optStr(fd, "scope"),
    start_date: optStr(fd, "start_date"),
    end_date: optStr(fd, "end_date"),
  });
  finish(error, "assignment");
}

export async function endAssignment(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("end_partner_assignment", {
    target_assignment: str(fd, "assignment_id"),
  });
  finish(error, "assignment");
}

/** Assigns every activity of a unit (optionally one stage) to the partner. */
export async function assignActivities(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  let query = supabase.from("schedule_activities").select("id").eq("unit_id", str(fd, "unit_id"));
  if (str(fd, "stage")) query = query.eq("stage", str(fd, "stage"));
  const { data } = await query;
  const { error } = await supabase.rpc("assign_activities", {
    activity_ids: (data ?? []).map((a) => a.id),
    target_partner: optStr(fd, "partner_id"),
  });
  finish(error, "assignment");
}

export async function raiseRfi(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("raise_rfi", {
    target_project: str(fd, "project_id"),
    data: {
      subject: str(fd, "subject"),
      question: str(fd, "question"),
      unit_id: str(fd, "unit_id"),
      partner_id: str(fd, "partner_id"),
      drawing_id: str(fd, "drawing_id"),
      due_date: str(fd, "due_date"),
    },
  });
  finish(error, "rfi");
}

export async function respondRfi(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("respond_rfi", {
    target_rfi: str(fd, "rfi_id"),
    body: str(fd, "body"),
    is_answer: fd.get("is_answer") === "on",
  });
  finish(error, "rfi");
}

export async function closeRfi(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("close_rfi", { target_rfi: str(fd, "rfi_id") });
  finish(error, "rfi");
}

export async function issueInstruction(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("issue_site_instruction", {
    target_project: str(fd, "project_id"),
    data: {
      partner_id: str(fd, "partner_id"),
      unit_id: str(fd, "unit_id"),
      rfi_id: str(fd, "rfi_id"),
      title: str(fd, "title"),
      instruction: str(fd, "instruction"),
    },
  });
  finish(error, "instruction");
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

export async function verifySiteReport(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("verify_site_report", {
    target_report: str(fd, "report_id"),
  });
  finish(error, "verified");
}

export async function recordInspection(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("record_inspection", {
    target_project: str(fd, "project_id"),
    data: {
      unit_id: str(fd, "unit_id"),
      title: str(fd, "title"),
      result: str(fd, "result"),
      inspected_on: str(fd, "inspected_on"),
      notes: str(fd, "notes"),
    },
  });
  finish(error, "inspection");
}

export async function openDefect(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("open_defect", {
    target_project: str(fd, "project_id"),
    data: {
      unit_id: str(fd, "unit_id"),
      inspection_id: str(fd, "inspection_id"),
      title: str(fd, "title"),
      description: str(fd, "description"),
      location: str(fd, "location"),
      severity: str(fd, "severity"),
      assigned_partner_id: str(fd, "assigned_partner_id"),
      due_date: str(fd, "due_date"),
    },
  });
  finish(error, "defect");
}

export async function updateDefect(fd: FormData) {
  const { supabase, finish } = await ctx(fd);
  const { error } = await supabase.rpc("update_defect", {
    target_defect: str(fd, "defect_id"),
    action: str(fd, "action"),
    note: optStr(fd, "note"),
  });
  finish(error, "defect");
}
