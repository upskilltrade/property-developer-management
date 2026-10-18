import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { AI_FALLBACK, AI_MODEL, AiRefusalError } from "@/lib/ai";
import type { ControlData } from "@/lib/control";
import { todayIso } from "@/lib/schedule";

export const riskCategories = [
  "SCHEDULE",
  "CASHFLOW",
  "COST",
  "QUALITY",
  "PROCUREMENT",
  "SALES",
  "CUSTOMER",
  "APPROVALS",
] as const;
export const riskSeverities = ["HIGH", "MEDIUM", "LOW"] as const;

const Review = z.object({
  summary_th: z.string(),
  summary_en: z.string(),
  risks: z.array(
    z.object({
      category: z.enum(riskCategories),
      severity: z.enum(riskSeverities),
      title_th: z.string(),
      title_en: z.string(),
      explanation_th: z.string(),
      explanation_en: z.string(),
      action_th: z.string(),
      action_en: z.string(),
      owner_role: z.string(),
      evidence: z.array(z.string()),
    }),
  ),
});

export type RiskEvidence = { id: string; label: string; link: string };
export type Risk = Omit<z.infer<typeof Review>["risks"][number], "evidence"> & {
  evidence: RiskEvidence[];
};

const PROMPT = `You are a risk analyst for a Thai property developer that builds and sells houses. Review the RECORDS (projects, houses, open issues and pending approvals, as of the date given) and identify the most important risks to schedule, cash flow, cost, quality, procurement, sales and customer satisfaction.

Rules:
- Every risk must cite the records that show it, using their ids exactly (e.g. "I3", "H12", "P1") in evidence. Never cite an id that is not in RECORDS, and never state a number that isn't in them.
- Prefer risks backed by several records or large amounts over one-off items; combine related records into one risk (e.g. several late houses in one stage, a cluster of overdue instalments).
- Severity: HIGH = likely to cause a missed handover, a cash shortfall or a budget overrun soon; MEDIUM = needs attention this month; LOW = watch.
- At most 8 risks, most severe first. If the records show no meaningful risk, return an empty list and say so in the summary.
- Write title/explanation/action in Thai (_th) and English (_en). The action must be concrete and say who should do it (owner_role, e.g. "Project manager", "Finance", "Procurement", "Sales").
- summary_th / summary_en: 2-3 sentences on the overall picture. Only data you were given; if a dimension (e.g. cost) is missing because the person can't see it, don't guess about it.`;

/**
 * Numbered source records for the model, taken from the control center data the person can see.
 * Each id maps back to a link so cited evidence opens the real record.
 */
export function buildRiskRecords(data: ControlData, appBase: string) {
  const records = new Map<string, RiskEvidence>();
  const add = (prefix: string, i: number, label: string, link: string) => {
    const id = `${prefix}${i + 1}`;
    records.set(id, { id, label, link });
    return id;
  };
  const projectCode = (id: string) => data.projectCode.get(id) ?? "";
  const unitCode = (id: string | null) => (id ? (data.unitCode.get(id) ?? "") : "");

  const projects = data.projects.map((p, i) => ({
    id: add("P", i, p.code, `${appBase}/projects/${p.id}`),
    code: p.code,
    name: p.name,
    units: p.units,
    progress_pct: Math.round(p.progress),
    planned_pct: Math.round(p.planned),
    late_activities: p.late,
    defects: p.defects,
    rfis_overdue: p.rfisOverdue,
    purchase_requests_pending: p.prPending,
    purchase_orders_overdue: p.poOverdue,
    purchase_orders_overdue_thb: p.poOverdueAmount,
    contractor_claims_pending_thb: p.claimsAmount,
    ...(p.finance
      ? {
          customer_scheduled_thb: p.scheduled,
          collected_thb: p.collected,
          outstanding_thb: p.outstanding,
          overdue_thb: p.overdue,
          due_next_30_days_thb: p.due30,
        }
      : {}),
    ...(p.cost
      ? {
          budget_thb: p.cost.baseline,
          committed_thb: p.cost.committed,
          actual_thb: p.cost.actual,
          forecast_thb: p.cost.forecast,
          cost_lines_over_budget: p.cost.overruns,
        }
      : {}),
    handover: p.handover,
  }));

  const houses = data.houses
    .filter((h) => h.late > 0 || h.overdue > 0 || h.highDefects > 0 || h.openService > 0)
    .sort((a, b) => b.overdue - a.overdue || b.late - a.late)
    .slice(0, 40)
    .map((h, i) => ({
      id: add(
        "H",
        i,
        `${projectCode(h.projectId)} ${h.code}`,
        `${appBase}/projects/${h.projectId}/units/${h.id}`,
      ),
      house: h.code,
      project: projectCode(h.projectId),
      sales_status: h.status,
      progress_pct: Math.round(h.progress),
      planned_pct: Math.round(h.planned),
      late_activities: h.late,
      overdue_thb: h.overdue,
      high_defects: h.highDefects,
      open_service_requests: h.openService,
      handover: h.handover,
    }));

  const issues = data.issues.slice(0, 60).map((x, i) => ({
    id: add(
      "I",
      i,
      `${x.ref}${x.unitId && unitCode(x.unitId) !== x.ref ? ` · ${unitCode(x.unitId)}` : ""}`,
      x.href,
    ),
    kind: x.kind,
    ref: x.ref,
    title: x.titleTh ?? x.title,
    project: projectCode(x.projectId),
    house: unitCode(x.unitId) || undefined,
    amount_thb: x.amount ?? undefined,
    due: x.due ?? undefined,
    days_overdue: x.daysOver,
    critical: x.critical,
  }));

  const approvals = data.approvals.slice(0, 40).map((a, i) => ({
    id: add("A", i, a.ref, a.href),
    kind: a.kind,
    ref: a.ref,
    title: a.title,
    project: projectCode(a.projectId),
    amount_thb: a.amount ?? undefined,
    waiting_since: a.since ?? undefined,
  }));

  return {
    records,
    payload: {
      as_of: todayIso(),
      projects,
      houses_with_problems: houses,
      open_issues: issues,
      open_issue_total: data.issues.length,
      pending_approvals: approvals,
      pending_approval_total: data.approvals.length,
    },
  };
}

export async function reviewRisks(data: ControlData, appBase: string) {
  const { records, payload } = buildRiskRecords(data, appBase);
  const response = await new Anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    system: PROMPT,
    output_config: { effort: "high", format: betaZodOutputFormat(Review) },
    ...AI_FALLBACK,
    messages: [{ role: "user", content: `RECORDS:\n${JSON.stringify(payload)}` }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) throw new AiRefusalError();
  return {
    ...validateRisks(response.parsed_output, records),
    records: records.size,
    usage: response.usage,
  };
}

/**
 * Keeps only citations to records that were actually sent, and only risks with at least one
 * valid citation; the rest are counted as discarded rather than shown.
 */
export function validateRisks(review: z.infer<typeof Review>, records: Map<string, RiskEvidence>) {
  let discarded = 0;
  const risks: Risk[] = [];
  for (const r of review.risks.slice(0, 8)) {
    const evidence = [...new Set(r.evidence.map((e) => e.trim().toUpperCase()))]
      .map((id) => records.get(id))
      .filter((e): e is RiskEvidence => Boolean(e));
    if (!evidence.length) {
      discarded++;
      continue;
    }
    risks.push({ ...r, evidence: evidence.slice(0, 12) });
  }
  return { summary_th: review.summary_th, summary_en: review.summary_en, risks, discarded };
}
