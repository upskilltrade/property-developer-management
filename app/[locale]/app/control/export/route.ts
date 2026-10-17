import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadControlCenter, timelineColumns, type TimelineEvent } from "@/lib/control";
import { toNumber } from "@/lib/format";

const datasets = ["houses", "receivables", "cost", "approvals", "issues", "timeline"] as const;
type Dataset = (typeof datasets)[number];

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n");

/**
 * CSV export for the control center. Every project in scope is checked with can_export (which
 * also requires finance access for finance datasets); projects that fail are left out, and each
 * export is written to the timeline.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dataset = req.nextUrl.searchParams.get("dataset") as Dataset | null;
  const projectFilter = req.nextUrl.searchParams.get("project") || null;
  if (!dataset || !datasets.includes(dataset))
    return new NextResponse("Unknown dataset", { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const appBase = `/${locale}/app`;
  const data = await loadControlCenter(supabase, appBase, projectFilter);
  const allowed = new Set<string>();
  await Promise.all(
    data.projects.map(async (p) => {
      const { data: ok } = await supabase.rpc("can_export", {
        target_project: p.id,
        dataset,
      });
      if (ok === true) allowed.add(p.id);
    }),
  );
  if (!allowed.size) return new NextResponse("Forbidden", { status: 403 });

  const code = (id: string | null) => (id ? (data.projectCode.get(id) ?? "") : "");
  const unit = (id: string | null) => (id ? (data.unitCode.get(id) ?? "") : "");
  const counts = new Map<string, number>();
  const count = (projectId: string) => counts.set(projectId, (counts.get(projectId) ?? 0) + 1);
  let rows: unknown[][] = [];

  if (dataset === "houses") {
    rows = [
      [
        "project",
        "unit",
        "status",
        "customer",
        "contract_no",
        "contract_status",
        "progress_pct",
        "planned_pct",
        "late_activities",
        "scheduled",
        "collected",
        "overdue",
        "open_defects",
        "high_defects",
        "handover",
        "open_service",
      ],
      ...data.houses
        .filter((h) => allowed.has(h.projectId))
        .map((h) => {
          count(h.projectId);
          return [
            code(h.projectId),
            h.code,
            h.status,
            h.customer,
            h.contract?.no,
            h.contract?.status,
            h.progress.toFixed(1),
            h.planned.toFixed(1),
            h.late,
            h.scheduled,
            h.collected,
            h.overdue,
            h.openDefects,
            h.highDefects,
            h.handover,
            h.openService,
          ];
        }),
    ];
  } else if (dataset === "receivables") {
    const { data: pays } = await supabase
      .from("payment_schedule_status")
      .select(
        "project_id,unit_id,sequence,label_th,label_en,due_date,amount,paid_amount,outstanding,payment_status",
      )
      .in("project_id", [...allowed])
      .eq("status", "ACTIVE")
      .order("due_date")
      .limit(20000);
    rows = [
      [
        "project",
        "unit",
        "sequence",
        "instalment",
        "due_date",
        "amount",
        "paid",
        "outstanding",
        "status",
      ],
      ...(pays ?? []).map((p) => {
        count(p.project_id);
        return [
          code(p.project_id),
          unit(p.unit_id),
          p.sequence,
          locale === "th" ? p.label_th : p.label_en,
          p.due_date,
          toNumber(p.amount),
          toNumber(p.paid_amount),
          toNumber(p.outstanding),
          p.payment_status,
        ];
      }),
    ];
  } else if (dataset === "cost") {
    rows = [
      [
        "project",
        "category_code",
        "category",
        "baseline",
        "committed",
        "actual",
        "certified",
        "forecast",
        "variance",
      ],
    ];
    for (const id of allowed) {
      const { data: report } = await supabase.rpc("get_cost_report", { target_project: id });
      for (const r of report ?? []) {
        count(id);
        rows.push([
          code(id),
          r.code,
          r.name,
          r.baseline,
          r.committed,
          r.actual,
          r.certified,
          r.forecast,
          r.variance,
        ]);
      }
    }
  } else if (dataset === "approvals") {
    rows = [
      ["project", "unit", "kind", "reference", "title", "amount", "submitted"],
      ...data.approvals
        .filter((a) => allowed.has(a.projectId))
        .map((a) => {
          count(a.projectId);
          return [code(a.projectId), unit(a.unitId), a.kind, a.ref, a.title, a.amount, a.since];
        }),
    ];
  } else if (dataset === "issues") {
    // Overdue instalments and cost overruns are finance data; leave them out unless the person
    // could also export the matching finance dataset.
    const financeOk = new Set<string>();
    await Promise.all(
      [...allowed].map(async (id) => {
        const { data: ok } = await supabase.rpc("can_view_finance", { target_project: id });
        if (ok === true) financeOk.add(id);
      }),
    );
    rows = [
      ["project", "unit", "kind", "critical", "reference", "title", "due", "days_over", "amount"],
      ...data.issues
        .filter((i) => allowed.has(i.projectId))
        .filter((i) => !["instalment", "overrun"].includes(i.kind) || financeOk.has(i.projectId))
        .map((i) => {
          count(i.projectId);
          return [
            code(i.projectId),
            unit(i.unitId),
            i.kind,
            i.critical ? "Y" : "",
            i.ref,
            locale === "th" && i.titleTh ? i.titleTh : i.title,
            i.due,
            i.daysOver,
            i.amount,
          ];
        }),
    ];
  } else {
    const { data: events } = await supabase
      .from("timeline_events")
      .select(timelineColumns)
      .in("project_id", [...allowed])
      .order("created_at", { ascending: false })
      .limit(20000);
    rows = [
      ["created_at", "project", "unit", "event_type", "entity_type", "title"],
      ...((events ?? []) as TimelineEvent[]).map((e) => {
        if (e.project_id) count(e.project_id);
        return [
          e.created_at,
          code(e.project_id),
          unit(e.unit_id),
          e.event_type,
          e.entity_type,
          e.title,
        ];
      }),
    ];
  }

  await Promise.all(
    [...allowed].map((id) =>
      supabase.rpc("log_export", { target_project: id, dataset, row_count: counts.get(id) ?? 0 }),
    ),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  // BOM so Excel opens Thai text as UTF-8.
  return new NextResponse(`﻿${csv(rows)}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${dataset}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
