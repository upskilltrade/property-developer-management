import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { createClient } from "@/lib/supabase/server";
import { loadControlCenter, timelineColumns, timelineHref, type ControlData } from "@/lib/control";
import { toNumber } from "@/lib/format";
import { AI_MODEL } from "@/lib/ai";
import { activityColumns, todayIso, weightedProgress, type Activity } from "@/lib/schedule";
import { cashflow, computeForecast } from "@/lib/forecast";
import { loadForecast } from "@/lib/forecast-data";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type One<T> = T | T[] | null | undefined;
const one = <T>(v: One<T>): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));
const round = (n: number) => Math.round(n * 100) / 100;

export const ASSISTANT_MODEL = AI_MODEL;

export const SYSTEM_PROMPT = `You are the management assistant inside DevPropertyPro, an ERP for a property developer building and selling houses in Thailand.

Answer questions about projects, houses (units), sales, customer payments, construction, procurement, cost, approvals and handover using only the data your tools return. The tools read the database as the signed-in user, so they return exactly what this person is allowed to see. When a tool reports "restricted", say the person does not have permission for that data; never estimate or fill it in.

How to answer:
- Reply in the language the user writes in (Thai or English).
- Lead with the answer, then the supporting facts. Keep it short; use bullet lists, not tables.
- Every record you mention must be a markdown link using the tool's "link" value exactly, e.g. [UNIT-01](/th/app/projects/.../units/...). Do not invent links.
- Amounts are Thai baht; write them like 1,250,000 บาท (or THB in English).
- Keep actual and forecast figures clearly separate, and say which is which.
- If the data does not answer the question, say so and suggest which screen or person would know.
- You can only read data. If asked to change something, explain where in the system to do it.`;

/** Read-only tools; each one queries through the user's own Supabase session (RLS applies). */
export const assistantTools: Anthropic.Beta.BetaTool[] = [
  {
    name: "portfolio_summary",
    description:
      "Headline numbers per project: units sold, customer collections (collected / outstanding / overdue), construction progress vs plan, late activities, open defects, procurement backlog, and budget vs forecast where the user may see cost. Start here for broad questions or 'summarize project X'.",
    input_schema: {
      type: "object",
      properties: {
        project_code: { type: "string", description: "Optional project code, e.g. PROJECT-001" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_houses",
    description:
      "One row per house/unit: sales status, customer, contract, verified progress vs planned, late activities, money collected and overdue, open defects, handover status. Use for 'which units are delayed', 'which houses are sold', etc.",
    input_schema: {
      type: "object",
      properties: { project_code: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "pending_approvals",
    description:
      "Everything waiting for someone's approval (payment evidence, bookings, drawings, VOs, change requests, budgets, PRs, POs, contractor claims, finance documents), oldest first.",
    input_schema: {
      type: "object",
      properties: { project_code: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "critical_issues",
    description:
      "Overdue or high-severity problems: high defects, overdue RFIs, overdue instalments, late deliveries, late milestones, overdue service requests and cost overruns.",
    input_schema: {
      type: "object",
      properties: { project_code: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "payments_due",
    description:
      "Customer instalments with money outstanding that are overdue or fall due within the next N days.",
    input_schema: {
      type: "object",
      properties: {
        days_ahead: { type: "integer", description: "Look-ahead window in days (default 30)" },
        project_code: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "cost_analysis",
    description:
      "Cost by category for one project: approved budget, committed (POs), paid, certified claims, forecast at completion and variance, plus the largest purchase orders and approved variation-order costs that drive the forecast. Use for 'why is cost forecast above budget'.",
    input_schema: {
      type: "object",
      properties: { project_code: { type: "string" } },
      required: ["project_code"],
      additionalProperties: false,
    },
  },
  {
    name: "financial_plan",
    description:
      "The owner's project financial plan: forecast revenue and cost per category (lump-sum estimates) next to what has actually been paid and committed, tax and transfer amounts from the owner's own rates, net profit and margin, in-house sales vs sole agent comparison, budget left per house for giveaways or spec, and the monthly cash-flow low point. Use for expected profit, 'how much is left to spend', funding needs or sales-mode questions.",
    input_schema: {
      type: "object",
      properties: { project_code: { type: "string" } },
      required: ["project_code"],
      additionalProperties: false,
    },
  },
  {
    name: "procurement_risk",
    description:
      "Materials and purchasing at risk: purchase orders not fully received (overdue or due within 14 days) with supplier names, and purchase requests needed soon that are not yet ordered.",
    input_schema: {
      type: "object",
      properties: { project_code: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "unit_details",
    description:
      "Everything about one unit: customer, contract, payment schedule, construction progress, open defects, variation orders, handover and service requests.",
    input_schema: {
      type: "object",
      properties: {
        unit_code: { type: "string", description: "Unit code, e.g. UNIT-03 or A-01" },
        project_code: { type: "string" },
      },
      required: ["unit_code"],
      additionalProperties: false,
    },
  },
  {
    name: "recent_activity",
    description: "Recent events from the project timeline (newest first).",
    input_schema: {
      type: "object",
      properties: {
        project_code: { type: "string" },
        days: { type: "integer", description: "How many days back (default 7, max 60)" },
      },
      additionalProperties: false,
    },
  },
];

type Input = { project_code?: string; unit_code?: string; days_ahead?: number; days?: number };

/** Runs tools for one assistant turn; shares the control-center load between tool calls. */
export function createToolRunner(supabase: Supabase, locale: string) {
  const appBase = `/${locale}/app`;
  const cache = new Map<string, Promise<ControlData>>();
  const control = (projectId: string | null) => {
    const key = projectId ?? "*";
    if (!cache.has(key)) cache.set(key, loadControlCenter(supabase, appBase, projectId));
    return cache.get(key)!;
  };
  let projectList: Promise<{ id: string; code: string; name: string }[]> | null = null;
  const projects = () =>
    (projectList ??= Promise.resolve(
      supabase
        .from("projects")
        .select("id,code,name")
        .order("code")
        .then((r) => r.data ?? []),
    ));
  /** Resolves a project code (case-insensitive); null = all projects. */
  const resolveProject = async (code?: string) => {
    if (!code) return { id: null as string | null };
    const all = await projects();
    const hit = all.find(
      (p) =>
        p.code.toLowerCase() === code.toLowerCase() || p.name.toLowerCase() === code.toLowerCase(),
    );
    if (!hit)
      return {
        error: `No accessible project "${code}". Available: ${all.map((p) => p.code).join(", ") || "none"}`,
      };
    return { id: hit.id };
  };
  const projectLink = (id: string) => `${appBase}/projects/${id}`;

  async function run(name: string, input: Input): Promise<unknown> {
    const today = todayIso();
    switch (name) {
      case "portfolio_summary": {
        const p = await resolveProject(input.project_code);
        if ("error" in p) return p;
        const d = await control(p.id);
        return {
          today,
          funnel: d.funnel,
          overdue_aging_thb: d.aging,
          projects: d.projects.map((x) => ({
            code: x.code,
            name: x.name,
            link: projectLink(x.id),
            control_center_link: `${appBase}/control?project=${x.id}`,
            houses_with_schedule: x.units,
            progress_pct: round(x.progress),
            planned_pct: round(x.planned),
            late_activities: x.late,
            open_defects: x.defects,
            rfis_open: x.rfisOpen,
            rfis_overdue: x.rfisOverdue,
            collections_thb: {
              scheduled: x.scheduled,
              collected: x.collected,
              outstanding: x.outstanding,
              overdue: x.overdue,
              due_next_30_days: x.due30,
            },
            procurement: {
              pr_pending: x.prPending,
              po_pending: x.poPending,
              po_overdue_delivery: x.poOverdue,
              claims_pending: x.claimsPending,
            },
            handover: x.handover,
            cost: x.cost ?? "restricted",
          })),
          houses_total: d.houses.length,
          houses_sold: d.houses.filter((h) =>
            ["CONTRACTED", "SOLD", "TRANSFERRED"].includes(h.status),
          ).length,
          pending_approvals: d.approvals.length,
          critical_issues: d.issues.filter((i) => i.critical).length,
        };
      }
      case "list_houses": {
        const p = await resolveProject(input.project_code);
        if ("error" in p) return p;
        const d = await control(p.id);
        return d.houses.map((h) => ({
          unit: h.code,
          project: d.projectCode.get(h.projectId),
          link: `${projectLink(h.projectId)}/units/${h.id}`,
          sales_status: h.status,
          customer: h.customer,
          contract: h.contract
            ? {
                no: h.contract.no,
                status: h.contract.status,
                link: `${appBase}/sales/contracts/${h.contract.id}`,
              }
            : null,
          has_schedule: h.hasSchedule,
          progress_pct: round(h.progress),
          planned_pct: round(h.planned),
          behind_plan_pct: round(h.planned - h.progress),
          late_activities: h.late,
          schedule_link: `${projectLink(h.projectId)}/units/${h.id}/schedule`,
          scheduled_thb: h.scheduled,
          collected_thb: h.collected,
          overdue_thb: h.overdue,
          open_defects: h.openDefects,
          high_defects: h.highDefects,
          handover: h.handover,
          open_service_requests: h.openService,
        }));
      }
      case "pending_approvals": {
        const p = await resolveProject(input.project_code);
        if ("error" in p) return p;
        const d = await control(p.id);
        return d.approvals.map((a) => ({
          kind: a.kind,
          ref: a.ref,
          title: a.title,
          project: d.projectCode.get(a.projectId),
          unit: a.unitId ? d.unitCode.get(a.unitId) : null,
          amount_thb: a.amount,
          submitted: a.since,
          link: a.href,
        }));
      }
      case "critical_issues": {
        const p = await resolveProject(input.project_code);
        if ("error" in p) return p;
        const d = await control(p.id);
        return d.issues.map((i) => ({
          kind: i.kind,
          critical: i.critical,
          ref: i.ref,
          title: locale === "th" && i.titleTh ? i.titleTh : i.title,
          project: d.projectCode.get(i.projectId),
          unit: i.unitId ? d.unitCode.get(i.unitId) : null,
          due: i.due,
          days_overdue: i.daysOver,
          amount_thb: i.amount,
          link: i.href,
        }));
      }
      case "payments_due": {
        const p = await resolveProject(input.project_code);
        if ("error" in p) return p;
        const days = Math.min(Math.max(Number(input.days_ahead) || 30, 1), 365);
        const until = new Date(Date.parse(today) + days * 86_400_000).toISOString().slice(0, 10);
        let q = supabase
          .from("payment_schedule_status")
          .select(
            "id,project_id,unit_id,label_th,label_en,amount,paid_amount,outstanding,due_date,payment_status,units(code)",
          )
          .eq("status", "ACTIVE")
          .gt("outstanding", 0)
          .lte("due_date", until)
          .order("due_date")
          .limit(300);
        if (p.id) q = q.eq("project_id", p.id);
        const { data } = await q;
        return {
          today,
          window_until: until,
          instalments: (data ?? []).map((s) => ({
            unit: one(s.units)?.code,
            instalment: locale === "th" ? s.label_th : s.label_en,
            due_date: s.due_date,
            status: s.payment_status,
            amount_thb: toNumber(s.amount),
            outstanding_thb: toNumber(s.outstanding),
            link: `${projectLink(s.project_id)}/units/${s.unit_id}/payments`,
          })),
        };
      }
      case "cost_analysis": {
        const p = await resolveProject(input.project_code);
        if ("error" in p) return p;
        if (!p.id) return { error: "project_code is required" };
        const { data: allowed } = await supabase.rpc("can_cost", {
          target_project: p.id,
          target_action: "VIEW",
        });
        if (allowed !== true)
          return { restricted: true, reason: "No COST_CONTROL.VIEW permission for this project" };
        const [{ data: report }, { data: pos }, { data: vos }, { data: voCosts }] =
          await Promise.all([
            supabase.rpc("get_cost_report", { target_project: p.id }),
            supabase
              .from("purchase_orders")
              .select("id,po_no,amount,status,cost_category_id,partner_organizations(name)")
              .eq("project_id", p.id)
              .in("status", ["PENDING_APPROVAL", "APPROVED", "PARTIALLY_RECEIVED", "RECEIVED"])
              .order("amount", { ascending: false })
              .limit(10),
            supabase
              .from("variation_orders")
              .select("id,vo_no,title,status,approved_version")
              .eq("project_id", p.id)
              .in("status", [
                "INTERNAL_APPROVED",
                "OFFERED",
                "CUSTOMER_APPROVED",
                "RELEASED",
                "CLOSED",
              ]),
            supabase.rpc("vo_costs", { target_project: p.id }),
          ]);
        const costOf = new Map(
          ((voCosts ?? []) as { vo_id: string; version: number; cost_delta: unknown }[]).map(
            (c) => [`${c.vo_id}:${c.version}`, toNumber(c.cost_delta)],
          ),
        );
        const rows = (report ?? []) as Record<string, unknown>[];
        return {
          link: `${projectLink(p.id)}/procurement?view=cost`,
          note: "baseline = approved budget; committed/actual/certified are actual figures; forecast is an estimate at completion",
          categories: rows.map((r) => ({
            code: r.code,
            name: r.name,
            baseline: toNumber(r.baseline),
            committed: toNumber(r.committed),
            actual_paid: toNumber(r.actual),
            certified: toNumber(r.certified),
            forecast: toNumber(r.forecast),
            variance: toNumber(r.variance),
            over_budget: toNumber(r.forecast) > toNumber(r.baseline),
          })),
          largest_purchase_orders: (pos ?? []).map((o) => ({
            po: o.po_no,
            supplier: one(o.partner_organizations)?.name,
            amount_thb: toNumber(o.amount),
            status: o.status,
            link: `${projectLink(p.id)}/procurement?view=orders`,
          })),
          approved_variation_orders: (vos ?? []).map((v) => ({
            vo: v.vo_no,
            title: v.title,
            status: v.status,
            cost_delta_thb: v.approved_version
              ? (costOf.get(`${v.id}:${v.approved_version}`) ?? null)
              : null,
            link: `${projectLink(p.id)}/changes/${v.id}`,
          })),
        };
      }
      case "financial_plan": {
        const p = await resolveProject(input.project_code);
        if ("error" in p) return p;
        if (!p.id) return { error: "project_code is required" };
        const f = await loadForecast(supabase, p.id);
        if (!f.plan) {
          const { data: allowed } = await supabase.rpc("can_view_finance", {
            target_project: p.id,
          });
          return allowed === true
            ? { plan: null, note: "No financial plan has been started for this project yet" }
            : {
                restricted: true,
                reason: "Financial plan is visible to owner, admin and finance only",
              };
        }
        const r = computeForecast(f.plan, f.lines, f.facts);
        const other = computeForecast(
          f.plan,
          f.lines,
          f.facts,
          f.plan.sales_mode === "SELF" ? "AGENT" : "SELF",
        );
        const cash = cashflow(f.plan, r);
        const missingRates = (
          ["transfer_fee_pct", "business_tax_pct", "income_tax_pct"] as const
        ).filter((k) => f.plan![k] == null);
        return {
          link: `${projectLink(p.id)}/forecast`,
          note: "forecast = owner's estimate; actual_paid/committed = recorded figures from linked cost categories. Taxes use only the owner's rates; a missing rate counts as zero.",
          period: { start: f.plan.start_month.slice(0, 7), end: cash.endMonth },
          sales_mode: f.plan.sales_mode,
          missing_rates: missingRates,
          revenue_forecast: r.revenue,
          sold: r.sold,
          cost_forecast: r.costs,
          derived_costs: r.derived,
          profit_before_tax: r.profitBeforeTax,
          net_profit: r.netProfit,
          margin_pct: round(r.margin * 100),
          target_margin_pct: f.plan.target_margin_pct,
          headroom_per_house: r.headroomPerUnit,
          other_sales_mode: {
            mode: f.plan.sales_mode === "SELF" ? "AGENT" : "SELF",
            costs: round(other.costs + other.derived.reduce((a, d) => a + d.amount, 0)),
            net_profit: other.netProfit,
          },
          lines: r.lines.map((l) => ({
            kind: l.kind,
            category: l.category,
            label: l.label,
            forecast: l.forecast,
            actual_paid: l.actual,
            committed: l.committed,
            remaining: l.remaining,
            excluded_in_this_mode: l.excluded || undefined,
          })),
          cash_low_point: { month: cash.lowest.month, cumulative: cash.lowest.cumulative },
        };
      }
      case "procurement_risk": {
        const p = await resolveProject(input.project_code);
        if ("error" in p) return p;
        const soon = new Date(Date.parse(today) + 14 * 86_400_000).toISOString().slice(0, 10);
        let poQ = supabase
          .from("purchase_orders")
          .select(
            "id,project_id,po_no,amount,status,delivery_due,partner_organizations(name),units(code)",
          )
          .in("status", ["APPROVED", "PARTIALLY_RECEIVED"])
          .lte("delivery_due", soon)
          .order("delivery_due")
          .limit(100);
        let prQ = supabase
          .from("purchase_requests")
          .select("id,project_id,pr_no,title,status,needed_by,estimated_amount")
          .in("status", ["SUBMITTED", "APPROVED"])
          .order("needed_by")
          .limit(100);
        if (p.id) {
          poQ = poQ.eq("project_id", p.id);
          prQ = prQ.eq("project_id", p.id);
        }
        const [{ data: pos }, { data: prs }] = await Promise.all([poQ, prQ]);
        return {
          today,
          purchase_orders_due_or_late: (pos ?? []).map((o) => ({
            po: o.po_no,
            supplier: one(o.partner_organizations)?.name,
            unit: one(o.units)?.code ?? null,
            status: o.status,
            delivery_due: o.delivery_due,
            late: Boolean(o.delivery_due && o.delivery_due < today),
            amount_thb: toNumber(o.amount),
            link: `${projectLink(o.project_id)}/procurement?view=orders`,
          })),
          requests_not_ordered: (prs ?? []).map((r) => ({
            pr: r.pr_no,
            title: r.title,
            status: r.status,
            needed_by: r.needed_by,
            estimated_thb: toNumber(r.estimated_amount),
            link: `${projectLink(r.project_id)}/procurement/requests/${r.id}`,
          })),
        };
      }
      case "unit_details": {
        const p = await resolveProject(input.project_code);
        if ("error" in p) return p;
        let uq = supabase
          .from("units")
          .select(
            "id,code,status,project_id,list_price,unit_sales(agreed_price,customers(full_name))",
          )
          .ilike("code", String(input.unit_code ?? ""))
          .limit(5);
        if (p.id) uq = uq.eq("project_id", p.id);
        const { data: units } = await uq;
        if (!units?.length) return { error: `No accessible unit "${input.unit_code}"` };
        if (units.length > 1)
          return {
            error: "Several projects have that unit code; pass project_code",
            projects: units.map((u) => u.project_id),
          };
        const u = units[0];
        const base = `${projectLink(u.project_id)}/units/${u.id}`;
        const [
          { data: contract },
          { data: pays },
          { data: acts },
          { data: defects },
          { data: vos },
          { data: handover },
          { data: srs },
        ] = await Promise.all([
          supabase
            .from("sales_contracts")
            .select("id,contract_no,status,signed_on")
            .eq("unit_id", u.id)
            .neq("status", "CANCELLED")
            .maybeSingle(),
          supabase
            .from("payment_schedule_status")
            .select("label_th,label_en,amount,paid_amount,outstanding,due_date,payment_status")
            .eq("unit_id", u.id)
            .eq("status", "ACTIVE")
            .order("sequence"),
          supabase.from("schedule_activities").select(activityColumns).eq("unit_id", u.id),
          supabase
            .from("defects")
            .select("defect_no,title,severity,status,due_date")
            .eq("unit_id", u.id)
            .neq("status", "VERIFIED"),
          supabase.from("variation_orders").select("id,vo_no,title,status").eq("unit_id", u.id),
          supabase
            .from("unit_handovers")
            .select("status,inspection_scheduled_at,handover_date")
            .eq("unit_id", u.id)
            .maybeSingle(),
          supabase
            .from("service_requests")
            .select("sr_no,title,status,due_date")
            .eq("unit_id", u.id)
            .in("status", ["OPEN", "ASSIGNED", "RESOLVED"]),
        ]);
        const work = ((acts ?? []) as Activity[]).filter((a) => !a.is_milestone);
        const sale = one(u.unit_sales);
        return {
          unit: u.code,
          link: base,
          sales_status: u.status,
          customer: one(sale?.customers)?.full_name ?? null,
          agreed_price_thb: sale?.agreed_price != null ? toNumber(sale.agreed_price) : null,
          contract: contract
            ? {
                no: contract.contract_no,
                status: contract.status,
                signed_on: contract.signed_on,
                link: `${appBase}/sales/contracts/${contract.id}`,
              }
            : null,
          payments_link: `${base}/payments`,
          instalments: (pays ?? []).map((s) => ({
            instalment: locale === "th" ? s.label_th : s.label_en,
            due_date: s.due_date,
            status: s.payment_status,
            amount_thb: toNumber(s.amount),
            paid_thb: toNumber(s.paid_amount),
            outstanding_thb: toNumber(s.outstanding),
          })),
          construction: work.length
            ? {
                progress_pct: round(weightedProgress(work)),
                activities: work.length,
                link: `${base}/schedule`,
              }
            : "no schedule",
          open_defects: (defects ?? []).map((d) => ({
            ...d,
            link: `${projectLink(u.project_id)}/site?view=defects`,
          })),
          variation_orders: (vos ?? []).map((v) => ({
            vo: v.vo_no,
            title: v.title,
            status: v.status,
            link: `${projectLink(u.project_id)}/changes/${v.id}`,
          })),
          handover: handover
            ? { ...handover, link: `${projectLink(u.project_id)}/handover/${u.id}` }
            : null,
          open_service_requests: srs ?? [],
        };
      }
      case "recent_activity": {
        const p = await resolveProject(input.project_code);
        if ("error" in p) return p;
        const days = Math.min(Math.max(Number(input.days) || 7, 1), 60);
        const since = new Date(Date.now() - days * 86_400_000).toISOString();
        let q = supabase
          .from("timeline_events")
          .select(timelineColumns)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(60);
        if (p.id) q = q.eq("project_id", p.id);
        const { data } = await q;
        return (data ?? []).map((e) => ({
          at: e.created_at,
          event: e.event_type,
          title: e.title,
          link: timelineHref(appBase, e),
        }));
      }
      default:
        return { error: `Unknown tool ${name}` };
    }
  }

  return async (name: string, input: unknown) => {
    try {
      return JSON.stringify(await run(name, (input ?? {}) as Input));
    } catch (e) {
      return JSON.stringify({ error: e instanceof Error ? e.message : "Tool failed" });
    }
  };
}
