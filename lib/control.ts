import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { toNumber } from "@/lib/format";
import {
  activityColumns,
  daysBetween,
  plannedProgress,
  scheduleState,
  todayIso,
  weightedProgress,
  type Activity,
} from "@/lib/schedule";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type One<T> = T | T[] | null | undefined;
const one = <T>(v: One<T>): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

export const approvalKinds = [
  "evidence",
  "booking",
  "drawing",
  "vo",
  "cr",
  "budget",
  "pr",
  "po",
  "claim",
  "financeDoc",
] as const;
export type ApprovalKind = (typeof approvalKinds)[number];

export const issueKinds = [
  "defect",
  "rfi",
  "instalment",
  "delivery",
  "milestone",
  "service",
  "overrun",
] as const;
export type IssueKind = (typeof issueKinds)[number];

export const funnelStages = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "VIEWING",
  "NEGOTIATION",
  "BOOKED",
] as const;
export const agingBuckets = ["d30", "d60", "d90", "d90plus"] as const;

export type ApprovalItem = {
  key: string;
  kind: ApprovalKind;
  ref: string;
  title: string;
  projectId: string;
  unitId: string | null;
  amount: number | null;
  since: string | null;
  href: string;
};

export type IssueItem = {
  key: string;
  kind: IssueKind;
  ref: string;
  title: string;
  projectId: string;
  unitId: string | null;
  amount: number | null;
  /** Due date the issue is measured against; days overdue is derived from it. */
  due: string | null;
  daysOver: number;
  critical: boolean;
  href: string;
  /** Thai title where the source record has one (instalment labels, milestone names). */
  titleTh?: string;
};

export type HouseRow = {
  id: string;
  code: string;
  projectId: string;
  status: string;
  customer: string | null;
  contract: { id: string; no: string; status: string } | null;
  progress: number;
  planned: number;
  hasSchedule: boolean;
  late: number;
  scheduled: number;
  collected: number;
  overdue: number;
  highDefects: number;
  openDefects: number;
  handover: string | null;
  openService: number;
};

export type CostTotals = {
  baseline: number;
  committed: number;
  actual: number;
  certified: number;
  forecast: number;
  variance: number;
  overruns: number;
};

export type ProjectRow = {
  id: string;
  code: string;
  name: string;
  currency: string;
  finance: boolean;
  cost: CostTotals | null;
  units: number;
  progress: number;
  planned: number;
  late: number;
  defects: { HIGH: number; MEDIUM: number; LOW: number };
  rfisOpen: number;
  rfisOverdue: number;
  siOpen: number;
  prPending: number;
  poPending: number;
  poOverdue: number;
  poOverdueAmount: number;
  claimsPending: number;
  claimsAmount: number;
  scheduled: number;
  collected: number;
  outstanding: number;
  overdue: number;
  due30: number;
  handover: Record<string, number>;
};

export type TimelineEvent = {
  id: string;
  project_id: string | null;
  unit_id: string | null;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  title: string;
  created_at: string;
};

/** Where a timeline event's source record lives. */
export function timelineHref(appBase: string, e: TimelineEvent) {
  const p = e.project_id ? `${appBase}/projects/${e.project_id}` : null;
  switch (e.entity_type) {
    case "lead":
      return e.entity_id ? `${appBase}/sales/leads/${e.entity_id}` : `${appBase}/sales/leads`;
    case "booking":
      return `${appBase}/sales/bookings`;
    case "contract":
      return e.entity_id
        ? `${appBase}/sales/contracts/${e.entity_id}`
        : `${appBase}/sales/contracts`;
    case "unit_hold":
      return `${appBase}/sales/inventory`;
  }
  if (!p) return null;
  switch (e.entity_type) {
    case "rfi":
      return e.entity_id ? `${p}/site/rfis/${e.entity_id}` : `${p}/site?view=rfis`;
    case "site_instruction":
      return `${p}/site?view=instructions`;
    case "defect":
      return `${p}/site?view=defects`;
    case "drawing":
      return e.entity_id ? `${p}/design/drawings/${e.entity_id}` : `${p}/design`;
    case "material_selection":
    case "customer_approval":
      return `${p}/design`;
    case "variation_order":
      return e.entity_id ? `${p}/changes/${e.entity_id}` : `${p}/changes`;
    case "change_request":
      return `${p}/changes`;
    case "purchase_order":
      return `${p}/procurement?view=orders`;
    case "budget_version":
      return `${p}/procurement?view=boq`;
    case "handover":
    case "service_request":
      return e.unit_id ? `${p}/handover/${e.unit_id}` : `${p}/handover`;
  }
  return e.unit_id ? `${p}/units/${e.unit_id}` : p;
}

export const timelineColumns =
  "id,project_id,unit_id,event_type,entity_type,entity_id,title,created_at";

const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0);

/**
 * Everything the control center shows, read straight from the operational tables. Row-level
 * security decides what each person sees; finance-only figures (cost report, finance documents)
 * come back empty for people without finance access and are flagged so the UI can say so.
 */
export async function loadControlCenter(
  supabase: Supabase,
  appBase: string,
  projectFilter: string | null,
) {
  const today = todayIso();
  const scope = <Q extends { eq: (c: string, v: string) => Q }>(q: Q) =>
    projectFilter ? q.eq("project_id", projectFilter) : q;
  const { data: projectRows } = await supabase
    .from("projects")
    .select("id,code,name,currency_code,organization_id")
    .order("code");
  const allProjects = projectRows ?? [];
  const projects = projectFilter ? allProjects.filter((p) => p.id === projectFilter) : allProjects;

  const [
    { data: unitRows },
    { data: actRows },
    { data: payRows },
    { data: evidenceRows },
    { data: leadRows },
    { data: bookingRows },
    { data: contractRows },
    { data: revisionRows },
    { data: voRows },
    { data: crRows },
    { data: budgetRows },
    { data: prRows },
    { data: poRows },
    { data: claimRows },
    { data: defectRows },
    { data: rfiRows },
    { data: siRows },
    { data: handoverRows },
    { data: srRows },
    { data: docRows },
    financeFlags,
    costReports,
  ] = await Promise.all([
    scope(
      supabase
        .from("units")
        .select("id,code,project_id,status,unit_sales(customers(full_name))")
        .order("code")
        .limit(5000),
    ),
    scope(supabase.from("schedule_activities").select(activityColumns).limit(10000)),
    scope(
      supabase
        .from("payment_schedule_status")
        .select(
          "id,project_id,unit_id,label_th,label_en,amount,paid_amount,outstanding,due_date,payment_status",
        )
        .eq("status", "ACTIVE")
        .limit(10000),
    ),
    scope(
      supabase
        .from("payment_evidence")
        .select("id,project_id,unit_id,amount,submitted_at")
        .eq("status", "SUBMITTED")
        .limit(500),
    ),
    scope(supabase.from("leads").select("id,project_id,stage").limit(10000)),
    scope(
      supabase
        .from("bookings")
        .select("id,project_id,unit_id,booking_no,status,agreed_price,created_at")
        .neq("status", "CANCELLED")
        .limit(5000),
    ),
    scope(
      supabase
        .from("sales_contracts")
        .select("id,project_id,unit_id,contract_no,status")
        .neq("status", "CANCELLED")
        .limit(5000),
    ),
    scope(
      supabase
        .from("drawing_revisions")
        .select("id,project_id,drawing_id,revision_code,submitted_at,drawings(drawing_no,title)")
        .eq("status", "IN_REVIEW")
        .limit(500),
    ),
    scope(
      supabase
        .from("variation_orders")
        .select("id,project_id,unit_id,vo_no,title,status,updated_at")
        .eq("status", "PENDING_INTERNAL")
        .limit(500),
    ),
    scope(
      supabase
        .from("change_requests")
        .select("id,project_id,unit_id,cr_no,title,created_at")
        .in("status", ["SUBMITTED", "UNDER_REVIEW"])
        .limit(500),
    ),
    scope(
      supabase
        .from("budget_versions")
        .select("id,project_id,version,submitted_at")
        .eq("status", "SUBMITTED")
        .limit(100),
    ),
    scope(
      supabase
        .from("purchase_requests")
        .select("id,project_id,unit_id,pr_no,title,estimated_amount,created_at")
        .eq("status", "SUBMITTED")
        .limit(500),
    ),
    scope(
      supabase
        .from("purchase_orders")
        .select("id,project_id,unit_id,po_no,amount,status,delivery_due,created_at")
        .in("status", ["PENDING_APPROVAL", "APPROVED", "PARTIALLY_RECEIVED"])
        .limit(2000),
    ),
    scope(
      supabase
        .from("progress_claims")
        .select("id,project_id,claim_no,claimed_amount,created_at")
        .eq("status", "SUBMITTED")
        .limit(500),
    ),
    scope(
      supabase
        .from("defects")
        .select("id,project_id,unit_id,defect_no,title,severity,status,due_date,created_at")
        .neq("status", "VERIFIED")
        .limit(5000),
    ),
    scope(
      supabase
        .from("rfis")
        .select("id,project_id,unit_id,rfi_no,subject,status,due_date")
        .neq("status", "CLOSED")
        .limit(2000),
    ),
    scope(
      supabase
        .from("site_instructions")
        .select("id,project_id")
        .in("status", ["ISSUED", "ACKNOWLEDGED"])
        .limit(2000),
    ),
    scope(supabase.from("unit_handovers").select("unit_id,project_id,status").limit(5000)),
    scope(
      supabase
        .from("service_requests")
        .select("id,project_id,unit_id,sr_no,title,status,due_date,created_at")
        .in("status", ["OPEN", "ASSIGNED", "RESOLVED"])
        .limit(2000),
    ),
    scope(
      supabase
        .from("financial_documents")
        .select("id,project_id,document_no,document_type,amount,document_date")
        .eq("status", "DRAFT")
        .limit(500),
    ),
    Promise.all(
      projects.map((p) =>
        supabase.rpc("can_view_finance", { target_project: p.id }).then((r) => r.data === true),
      ),
    ),
    Promise.all(
      // The cost report is COST_CONTROL data; without that permission it would read as zeros.
      projects.map(async (p) => {
        const { data: allowed } = await supabase.rpc("can_cost", {
          target_project: p.id,
          target_action: "VIEW",
        });
        if (allowed !== true) return null;
        const { data, error } = await supabase.rpc("get_cost_report", { target_project: p.id });
        return error ? null : (data ?? []);
      }),
    ),
  ]);

  const units = unitRows ?? [];
  const acts = (actRows ?? []) as Activity[];
  const pays = payRows ?? [];
  const defects = defectRows ?? [];
  const rfis = rfiRows ?? [];
  const pos = poRows ?? [];
  const srs = srRows ?? [];
  const unitCode = new Map(units.map((u) => [u.id, u.code]));
  const projectCode = new Map(allProjects.map((p) => [p.id, p.code]));
  const projectBase = (id: string) => `${appBase}/projects/${id}`;

  // ---- houses: one row per unit across every project in scope
  const actsByUnit = new Map<string, Activity[]>();
  for (const a of acts)
    if (a.unit_id) actsByUnit.set(a.unit_id, [...(actsByUnit.get(a.unit_id) ?? []), a]);
  const contractByUnit = new Map((contractRows ?? []).map((c) => [c.unit_id, c]));
  const handoverByUnit = new Map((handoverRows ?? []).map((h) => [h.unit_id, h.status]));
  const houses: HouseRow[] = units.map((u) => {
    const ua = (actsByUnit.get(u.id) ?? []).filter((a) => !a.is_milestone);
    const up = pays.filter((p) => p.unit_id === u.id);
    const ud = defects.filter((d) => d.unit_id === u.id);
    const c = contractByUnit.get(u.id);
    return {
      id: u.id,
      code: u.code,
      projectId: u.project_id,
      status: u.status,
      customer: one(one(u.unit_sales)?.customers)?.full_name ?? null,
      contract: c ? { id: c.id, no: c.contract_no, status: c.status } : null,
      progress: weightedProgress(ua),
      planned: plannedProgress(ua, today),
      hasSchedule: ua.length > 0,
      late: (actsByUnit.get(u.id) ?? []).filter((a) => {
        const st = scheduleState(a, today);
        return !st.done && (st.late || st.overdue);
      }).length,
      scheduled: sum(up, (p) => toNumber(p.amount)),
      collected: sum(up, (p) => toNumber(p.paid_amount)),
      overdue: sum(
        up.filter((p) => p.payment_status === "OVERDUE"),
        (p) => toNumber(p.outstanding),
      ),
      highDefects: ud.filter((d) => d.severity === "HIGH").length,
      openDefects: ud.length,
      handover: handoverByUnit.get(u.id) ?? null,
      openService: srs.filter((s) => s.unit_id === u.id).length,
    };
  });

  // ---- per-project health
  const projectsOut: ProjectRow[] = projects.map((p, i) => {
    const ph = houses.filter((h) => h.projectId === p.id && h.hasSchedule);
    const pp = pays.filter((x) => x.project_id === p.id);
    const pd = defects.filter((d) => d.project_id === p.id);
    const pr = rfis.filter((r) => r.project_id === p.id);
    const ppo = pos.filter((o) => o.project_id === p.id);
    const overduePo = ppo.filter(
      (o) => o.status !== "PENDING_APPROVAL" && o.delivery_due && o.delivery_due < today,
    );
    const claims = (claimRows ?? []).filter((c) => c.project_id === p.id);
    const report = costReports[i] as
      | {
          baseline: unknown;
          committed: unknown;
          actual: unknown;
          certified: unknown;
          forecast: unknown;
          variance: unknown;
        }[]
      | null;
    const finance = financeFlags[i];
    const cost = report
      ? {
          baseline: sum(report, (r) => toNumber(r.baseline)),
          committed: sum(report, (r) => toNumber(r.committed)),
          actual: sum(report, (r) => toNumber(r.actual)),
          certified: sum(report, (r) => toNumber(r.certified)),
          forecast: sum(report, (r) => toNumber(r.forecast)),
          variance: sum(report, (r) => toNumber(r.variance)),
          overruns: report.filter((r) => toNumber(r.forecast) > toNumber(r.baseline)).length,
        }
      : null;
    const handover: Record<string, number> = {};
    for (const h of handoverRows ?? [])
      if (h.project_id === p.id) handover[h.status] = (handover[h.status] ?? 0) + 1;
    const in30 = (d: string) => {
      const n = daysBetween(today, d);
      return n != null && n >= 0 && n <= 30;
    };
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      currency: p.currency_code ?? "THB",
      finance,
      cost,
      units: ph.length,
      progress: ph.length ? sum(ph, (h) => h.progress) / ph.length : 0,
      planned: ph.length ? sum(ph, (h) => h.planned) / ph.length : 0,
      late: sum(ph, (h) => h.late),
      defects: {
        HIGH: pd.filter((d) => d.severity === "HIGH").length,
        MEDIUM: pd.filter((d) => d.severity === "MEDIUM").length,
        LOW: pd.filter((d) => d.severity === "LOW").length,
      },
      rfisOpen: pr.length,
      rfisOverdue: pr.filter((r) => r.status === "OPEN" && r.due_date && r.due_date < today).length,
      siOpen: (siRows ?? []).filter((s) => s.project_id === p.id).length,
      prPending: (prRows ?? []).filter((r) => r.project_id === p.id).length,
      poPending: ppo.filter((o) => o.status === "PENDING_APPROVAL").length,
      poOverdue: overduePo.length,
      poOverdueAmount: sum(overduePo, (o) => toNumber(o.amount)),
      claimsPending: claims.length,
      claimsAmount: sum(claims, (c) => toNumber(c.claimed_amount)),
      scheduled: sum(pp, (x) => toNumber(x.amount)),
      collected: sum(pp, (x) => toNumber(x.paid_amount)),
      outstanding: sum(pp, (x) => toNumber(x.outstanding)),
      overdue: sum(
        pp.filter((x) => x.payment_status === "OVERDUE"),
        (x) => toNumber(x.outstanding),
      ),
      due30: sum(
        pp.filter((x) => toNumber(x.outstanding) > 0 && in30(x.due_date)),
        (x) => toNumber(x.outstanding),
      ),
      handover,
    };
  });

  // ---- sales funnel (leads by furthest stage reached is not stored; current stage is)
  const leads = leadRows ?? [];
  const funnel = {
    stages: Object.fromEntries(
      funnelStages.map((s) => [s, leads.filter((l) => l.stage === s).length]),
    ) as Record<(typeof funnelStages)[number], number>,
    lost: leads.filter((l) => l.stage === "LOST").length,
    leads: leads.length,
    bookings: (bookingRows ?? []).filter((b) => b.status === "CONFIRMED").length,
    contracts: (contractRows ?? []).filter((c) => c.status === "SIGNED").length,
    transferred: units.filter((u) => u.status === "TRANSFERRED").length,
  };

  // ---- cash collection aging (outstanding on overdue instalments, by days past due)
  const aging = { d30: 0, d60: 0, d90: 0, d90plus: 0 };
  const overdueInstalments = pays
    .filter((x) => x.payment_status === "OVERDUE" && toNumber(x.outstanding) > 0)
    .map((x) => ({ ...x, days: daysBetween(x.due_date, today) ?? 0 }));
  for (const x of overdueInstalments) {
    const key = x.days <= 30 ? "d30" : x.days <= 60 ? "d60" : x.days <= 90 ? "d90" : "d90plus";
    aging[key] += toNumber(x.outstanding);
  }

  // ---- pending approvals, oldest first
  const approvals: ApprovalItem[] = [
    ...(evidenceRows ?? []).map((e) => ({
      key: `ev-${e.id}`,
      kind: "evidence" as const,
      ref: unitCode.get(e.unit_id) ?? "",
      title: "",
      projectId: e.project_id,
      unitId: e.unit_id,
      amount: toNumber(e.amount),
      since: e.submitted_at,
      href: `${projectBase(e.project_id)}/units/${e.unit_id}/payments`,
    })),
    ...(bookingRows ?? [])
      .filter((b) => b.status === "PENDING_APPROVAL")
      .map((b) => ({
        key: `bk-${b.id}`,
        kind: "booking" as const,
        ref: b.booking_no,
        title: unitCode.get(b.unit_id) ?? "",
        projectId: b.project_id,
        unitId: b.unit_id,
        amount: toNumber(b.agreed_price),
        since: b.created_at,
        href: `${appBase}/sales/bookings`,
      })),
    ...(revisionRows ?? []).map((r) => {
      const d = one(r.drawings);
      return {
        key: `dr-${r.id}`,
        kind: "drawing" as const,
        ref: `${d?.drawing_no ?? ""} ${r.revision_code}`.trim(),
        title: d?.title ?? "",
        projectId: r.project_id,
        unitId: null,
        amount: null,
        since: r.submitted_at,
        href: `${projectBase(r.project_id)}/design/drawings/${r.drawing_id}`,
      };
    }),
    ...(voRows ?? []).map((v) => ({
      key: `vo-${v.id}`,
      kind: "vo" as const,
      ref: v.vo_no,
      title: v.title,
      projectId: v.project_id,
      unitId: v.unit_id,
      amount: null,
      since: v.updated_at,
      href: `${projectBase(v.project_id)}/changes/${v.id}`,
    })),
    ...(crRows ?? []).map((c) => ({
      key: `cr-${c.id}`,
      kind: "cr" as const,
      ref: c.cr_no,
      title: c.title,
      projectId: c.project_id,
      unitId: c.unit_id,
      amount: null,
      since: c.created_at,
      href: `${projectBase(c.project_id)}/changes`,
    })),
    ...(budgetRows ?? []).map((b) => ({
      key: `bv-${b.id}`,
      kind: "budget" as const,
      ref: `v${b.version}`,
      title: "",
      projectId: b.project_id,
      unitId: null,
      amount: null,
      since: b.submitted_at,
      href: `${projectBase(b.project_id)}/procurement?view=boq`,
    })),
    ...(prRows ?? []).map((r) => ({
      key: `pr-${r.id}`,
      kind: "pr" as const,
      ref: r.pr_no,
      title: r.title,
      projectId: r.project_id,
      unitId: r.unit_id,
      amount: toNumber(r.estimated_amount),
      since: r.created_at,
      href: `${projectBase(r.project_id)}/procurement/requests/${r.id}`,
    })),
    ...pos
      .filter((o) => o.status === "PENDING_APPROVAL")
      .map((o) => ({
        key: `po-${o.id}`,
        kind: "po" as const,
        ref: o.po_no,
        title: "",
        projectId: o.project_id,
        unitId: o.unit_id,
        amount: toNumber(o.amount),
        since: o.created_at,
        href: `${projectBase(o.project_id)}/procurement?view=orders`,
      })),
    ...(claimRows ?? []).map((c) => ({
      key: `pc-${c.id}`,
      kind: "claim" as const,
      ref: c.claim_no,
      title: "",
      projectId: c.project_id,
      unitId: null,
      amount: toNumber(c.claimed_amount),
      since: c.created_at,
      href: `${projectBase(c.project_id)}/procurement?view=claims`,
    })),
    ...(docRows ?? [])
      .filter((d) => d.project_id)
      .map((d) => ({
        key: `fd-${d.id}`,
        kind: "financeDoc" as const,
        ref: d.document_no,
        title: d.document_type,
        projectId: d.project_id!,
        unitId: null,
        amount: toNumber(d.amount),
        since: d.document_date,
        href: `${projectBase(d.project_id!)}/finance`,
      })),
  ].sort((a, b) => (a.since ?? "").localeCompare(b.since ?? ""));

  // ---- critical issues: things that are overdue or high severity
  const over = (due: string | null) => (due ? Math.max(0, daysBetween(due, today) ?? 0) : 0);
  const issues: IssueItem[] = [
    ...defects
      .filter(
        (d) => d.status === "OPEN" && (d.severity === "HIGH" || (d.due_date && d.due_date < today)),
      )
      .map((d) => ({
        key: `df-${d.id}`,
        kind: "defect" as const,
        ref: d.defect_no,
        title: d.title,
        projectId: d.project_id,
        unitId: d.unit_id,
        amount: null,
        due: d.due_date,
        daysOver: over(d.due_date),
        critical: d.severity === "HIGH",
        href: `${projectBase(d.project_id)}/site?view=defects`,
      })),
    ...rfis
      .filter((r) => r.status === "OPEN" && r.due_date && r.due_date < today)
      .map((r) => ({
        key: `rfi-${r.id}`,
        kind: "rfi" as const,
        ref: r.rfi_no,
        title: r.subject,
        projectId: r.project_id,
        unitId: r.unit_id,
        amount: null,
        due: r.due_date,
        daysOver: over(r.due_date),
        critical: over(r.due_date) > 7,
        href: `${projectBase(r.project_id)}/site/rfis/${r.id}`,
      })),
    ...overdueInstalments.map((x) => ({
      key: `pay-${x.id}`,
      kind: "instalment" as const,
      ref: unitCode.get(x.unit_id) ?? "",
      title: x.label_en,
      titleTh: x.label_th,
      projectId: x.project_id,
      unitId: x.unit_id,
      amount: toNumber(x.outstanding),
      due: x.due_date,
      daysOver: x.days,
      critical: x.days > 30,
      href: `${projectBase(x.project_id)}/units/${x.unit_id}/payments`,
    })),
    ...pos
      .filter((o) => o.status !== "PENDING_APPROVAL" && o.delivery_due && o.delivery_due < today)
      .map((o) => ({
        key: `dl-${o.id}`,
        kind: "delivery" as const,
        ref: o.po_no,
        title: "",
        projectId: o.project_id,
        unitId: o.unit_id,
        amount: toNumber(o.amount),
        due: o.delivery_due,
        daysOver: over(o.delivery_due),
        critical: over(o.delivery_due) > 14,
        href: `${projectBase(o.project_id)}/procurement?view=orders`,
      })),
    ...acts
      .filter((a) => {
        if (!a.is_milestone) return false;
        const st = scheduleState(a, today);
        return !st.done && st.overdue;
      })
      .map((a) => ({
        key: `ms-${a.id}`,
        kind: "milestone" as const,
        ref: a.unit_id ? (unitCode.get(a.unit_id) ?? a.code) : a.code,
        title: a.name_en,
        titleTh: a.name_th,
        projectId: a.project_id,
        unitId: a.unit_id,
        amount: null,
        due: a.forecast_finish,
        daysOver: over(a.forecast_finish),
        critical: true,
        href: a.unit_id
          ? `${projectBase(a.project_id)}/units/${a.unit_id}/schedule`
          : `${projectBase(a.project_id)}/schedule`,
      })),
    ...srs
      .filter((s) => s.status !== "RESOLVED" && s.due_date && s.due_date < today)
      .map((s) => ({
        key: `sr-${s.id}`,
        kind: "service" as const,
        ref: s.sr_no,
        title: s.title,
        projectId: s.project_id,
        unitId: s.unit_id,
        amount: null,
        due: s.due_date,
        daysOver: over(s.due_date),
        critical: over(s.due_date) > 7,
        href: `${projectBase(s.project_id)}/handover/${s.unit_id}`,
      })),
    ...projectsOut
      .filter((p) => p.cost && p.cost.overruns > 0)
      .map((p) => ({
        key: `ov-${p.id}`,
        kind: "overrun" as const,
        ref: p.code,
        title: String(p.cost!.overruns),
        projectId: p.id,
        unitId: null,
        amount: p.cost!.forecast - p.cost!.baseline,
        due: null,
        daysOver: 0,
        critical: p.cost!.forecast > p.cost!.baseline,
        href: `${projectBase(p.id)}/procurement?view=cost`,
      })),
  ].sort((a, b) => Number(b.critical) - Number(a.critical) || b.daysOver - a.daysOver);

  return {
    projects: projectsOut,
    allProjects,
    houses,
    funnel,
    aging,
    approvals,
    issues,
    unitCode,
    projectCode,
    anyFinance: financeFlags.some(Boolean),
  };
}

export type ControlData = Awaited<ReturnType<typeof loadControlCenter>>;
