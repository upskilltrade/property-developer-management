import type { Metadata } from "next";
import {
  ClipboardCheck,
  Gift,
  Landmark,
  Percent,
  PiggyBank,
  Settings2,
  ShieldAlert,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { formatMoney, formatMonth, formatNumber, formatPercent } from "@/lib/format";
import {
  cashflow,
  computeForecast,
  feasibility,
  feasibilityTargets,
  forecastCostCategories,
  forecastRevenueCategories,
  type CheckStatus,
  type ComputedLine,
  type ForecastPlan,
  type GroupStatus,
} from "@/lib/forecast";
import { loadForecast } from "@/lib/forecast-data";
import { Panel } from "@/components/ui/panel";
import { Kpi, KpiStrip } from "@/components/ui/kpi";
import { Table, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet } from "@/components/ui/sheet";
import { Hidden } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/components/ui/cn";
import { ForecastLineForm } from "@/components/domain/forecast-line-form";
import { ForecastPlanForm } from "@/components/domain/forecast-plan-form";
import { initForecast, removeForecastLine, saveForecastLine, saveForecastPlan } from "./actions";

export const metadata: Metadata = { title: "Financial plan" };

/**
 * Project financial plan: round-number forecast by category, compared with what the system has
 * recorded. Owner/Admin edit; people who may view the project's finance can read.
 */
export default async function ProjectForecast({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id } = await params;
  const { supabase } = await getSession(locale);
  const f = t.forecast;

  const { data: project } = await supabase
    .from("projects")
    .select("organization_id")
    .eq("id", id)
    .maybeSingle();
  const [{ data: canPlan }, { data: canView }] = await Promise.all([
    project
      ? supabase.rpc("can_plan_forecast", { target_org: project.organization_id })
      : Promise.resolve({ data: false }),
    supabase.rpc("can_view_finance", { target_project: id }),
  ]);
  if (!project || (!canPlan && !canView))
    return (
      <Panel>
        <EmptyState icon={<ShieldAlert />} title={f.noAccess} />
      </Panel>
    );

  const data = await loadForecast(supabase, id);
  const hidden = { locale, project_id: id };
  if (!data.plan || !data.lines.length)
    return (
      <Panel>
        <EmptyState
          icon={<TrendingUp />}
          title={f.empty}
          body={canPlan ? f.emptyBody : f.emptyViewer}
          action={
            canPlan ? (
              <form action={initForecast}>
                <Hidden values={hidden} />
                <SubmitButton>{f.start}</SubmitButton>
              </form>
            ) : undefined
          }
        />
      </Panel>
    );

  const plan = data.plan;
  const result = computeForecast(plan, data.lines, data.facts);
  const revenueGap =
    data.facts.unpricedUnits > 0 &&
    data.lines.some((l) => l.method === "UNITS_FROM_SYSTEM" && !l.rate);
  const self =
    plan.sales_mode === "SELF" ? result : computeForecast(plan, data.lines, data.facts, "SELF");
  const agent =
    plan.sales_mode === "AGENT" ? result : computeForecast(plan, data.lines, data.facts, "AGENT");
  const cash = cashflow(plan, result);
  const feas = feasibility(plan, result, data.facts);
  const checkTone = {
    OK: "success",
    WARN: "warning",
    MISSING: "neutral",
  } as const satisfies Record<CheckStatus, string>;
  const groupTone = { LOW: "info", OK: "success", HIGH: "danger" } as const satisfies Record<
    GroupStatus,
    string
  >;
  const pctText = (v: number) => formatPercent(locale, v);
  const money = (v: number | null | undefined) => (v == null ? "—" : formatMoney(locale, v));
  const share = (v: number) => (result.revenue ? formatPercent(locale, v / result.revenue) : "—");
  const totalCosts = result.costs + result.derived.reduce((a, d) => a + d.amount, 0);
  const rateText = (v: number | null) =>
    v == null ? f.rateMissing : `${formatNumber(locale, v, 3)}%`;

  const lineForm = (kind: "REVENUE" | "COST", line?: ComputedLine) => (
    <ForecastLineForm
      action={saveForecastLine}
      hidden={hidden}
      line={line}
      kind={kind}
      categoryOptions={kind === "REVENUE" ? forecastRevenueCategories : forecastCostCategories}
      costCategories={data.categories}
      totalFloorArea={data.facts.totalFloorArea}
      unpricedUnits={data.facts.unpricedUnits}
      labels={{
        ...f.line,
        save: t.common.save,
        categories: f.categories,
        methods: f.methods,
        timings: f.timings,
      }}
    />
  );
  const methodText = (l: ComputedLine) => {
    if (l.method === "PER_SQM")
      return `${formatNumber(locale, l.rate)} × ${formatNumber(locale, l.quantity, 2)} ${f.sqm}`;
    if (l.method === "PER_UNIT")
      return `${formatNumber(locale, l.rate)} × ${formatNumber(locale, l.quantity)}`;
    if (l.method === "PCT_REVENUE") return `${formatNumber(locale, l.pct, 3)}% ${f.ofRevenue}`;
    if (l.method === "UNITS_FROM_SYSTEM")
      return data.facts.unpricedUnits && l.rate
        ? `${f.methods.UNITS_FROM_SYSTEM} ${f.unpricedRate
            .replace("{rate}", formatNumber(locale, l.rate))
            .replace("{n}", String(data.facts.unpricedUnits))}`
        : f.methods.UNITS_FROM_SYSTEM;
    return f.methods.LUMP;
  };
  const lineRow = (l: ComputedLine) => (
    <TR key={l.id} className={cn(l.excluded && "opacity-50")}>
      <TD>
        <p className="font-medium">{l.label}</p>
        <p className="text-2xs text-muted">
          {f.categories[l.category as keyof typeof f.categories] ?? l.category} ·{" "}
          {f.timings[l.timing]}
          {l.excluded ? ` · ${f.excludedAgent}` : ""}
        </p>
      </TD>
      <TD className="text-2xs text-muted">{methodText(l)}</TD>
      <TD align="right" className="font-medium num">
        {money(l.forecast)}
      </TD>
      <TD align="right" className="text-muted num">
        {share(l.forecast)}
      </TD>
      {l.kind === "COST" ? (
        <>
          <TD align="right" className="num">
            {l.actual == null ? <span className="text-faint">—</span> : money(l.actual)}
          </TD>
          <TD align="right" className="text-muted num">
            {l.committed == null ? <span className="text-faint">—</span> : money(l.committed)}
          </TD>
          <TD
            align="right"
            className={cn(
              "num",
              l.remaining != null && l.remaining < 0 && "font-semibold text-red-700",
            )}
          >
            {l.remaining == null ? <span className="text-faint">—</span> : money(l.remaining)}
          </TD>
        </>
      ) : null}
      {canPlan ? (
        <TD align="right">
          <div className="flex justify-end gap-1">
            <Sheet
              title={f.editLine}
              triggerLabel={f.edit}
              triggerVariant="ghost"
              triggerSize="xs"
              triggerIcon={null}
            >
              {lineForm(l.kind, l)}
            </Sheet>
            <form action={removeForecastLine}>
              <Hidden values={{ ...hidden, line_id: l.id }} />
              <button
                type="submit"
                aria-label={f.remove}
                title={f.remove}
                className="grid size-6 place-items-center rounded text-muted hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="size-3.5" />
              </button>
            </form>
          </div>
        </TD>
      ) : null}
    </TR>
  );

  const scenario = (label: string, r: typeof result, active: boolean) => (
    <div
      className={cn(
        "rounded-lg border p-3",
        active ? "border-brand bg-brand-soft/40" : "border-line",
      )}
    >
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        {label}
        {active ? <Badge tone="info">{f.chosen}</Badge> : null}
      </p>
      <dl className="mt-2 space-y-1 text-[13px]">
        <div className="flex justify-between">
          <dt className="text-muted">{f.kpi.costs}</dt>
          <dd className="num">{money(r.costs + r.derived.reduce((a, d) => a + d.amount, 0))}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">{f.kpi.net}</dt>
          <dd className={cn("font-semibold num", r.netProfit < 0 && "text-red-700")}>
            {money(r.netProfit)} ({formatPercent(locale, r.margin)})
          </dd>
        </div>
      </dl>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{f.title}</h2>
          <p className="max-w-3xl text-[13px] text-muted">
            {f.subtitle} · {formatMonth(locale, plan.start_month)} →{" "}
            {formatMonth(locale, `${cash.endMonth}-01`)} (
            {f.months.replace("{n}", String(plan.sell_out_months))})
          </p>
        </div>
        {canPlan ? <PlanSheet plan={plan} hidden={hidden} t={t} /> : <Badge>{f.readOnly}</Badge>}
      </div>

      {revenueGap ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {f.unpriced.replace("{n}", String(data.facts.unpricedUnits))}
        </p>
      ) : null}
      <KpiStrip cols={6}>
        <Kpi
          label={f.kpi.revenue}
          value={money(result.revenue)}
          tone="brand"
          icon={<TrendingUp />}
        />
        <Kpi
          label={f.kpi.costs}
          value={money(totalCosts)}
          sub={share(totalCosts)}
          icon={<Wallet />}
        />
        <Kpi
          label={f.kpi.beforeTax}
          value={money(result.profitBeforeTax)}
          sub={formatPercent(locale, result.marginBeforeTax)}
          tone={result.profitBeforeTax < 0 ? "negative" : "positive"}
          icon={<Percent />}
        />
        <Kpi
          label={f.kpi.net}
          value={money(result.netProfit)}
          sub={formatPercent(locale, result.margin)}
          tone={result.netProfit < 0 ? "negative" : "positive"}
          icon={<PiggyBank />}
        />
        <Kpi
          label={f.kpi.headroom}
          value={result.headroomPerUnit == null ? "—" : money(result.headroomPerUnit)}
          sub={
            result.headroomPerUnit == null
              ? f.kpi.headroomMissing
              : f.kpi.headroomSub.replace(
                  "{n}",
                  formatNumber(locale, plan.target_margin_pct ?? 0, 1),
                )
          }
          tone={
            result.headroomPerUnit != null && result.headroomPerUnit < 0 ? "negative" : "default"
          }
          icon={<Gift />}
        />
        <Kpi
          label={f.kpi.peakFunding}
          value={money(Math.max(0, -cash.lowest.cumulative))}
          sub={formatMonth(locale, `${cash.lowest.month}-01`)}
          icon={<Landmark />}
        />
      </KpiStrip>

      <Panel
        title={f.feasibility.title}
        description={f.feasibility.body}
        actions={<ClipboardCheck className="size-4 text-muted" />}
      >
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              [
                "costMultiple",
                (v: number) => `${formatNumber(locale, v, 2)}×`,
                `${formatNumber(locale, feasibilityTargets.costMultiple, 2)}`,
              ],
              ["landShare", pctText, pctText(feasibilityTargets.landShare)],
              ["sellableRatio", pctText, pctText(feasibilityTargets.sellableRatio)],
              ["marginBeforeTax", pctText, pctText(feasibilityTargets.marginBeforeTax)],
            ] as const
          ).map(([key, show, target]) => {
            const c = feas.checks[key];
            return (
              <div key={key} className="rounded-lg border border-line p-3">
                <p className="flex items-center justify-between gap-2 text-2xs text-muted">
                  {f.feasibility.checks[key]}
                  <Badge tone={checkTone[c.status]}>{f.feasibility.status[c.status]}</Badge>
                </p>
                <p className="mt-1 text-lg font-semibold num">
                  {c.value == null ? "—" : show(c.value)}
                </p>
                <p className="text-2xs text-muted">
                  {c.value == null
                    ? f.feasibility.missing[key]
                    : f.feasibility.targets[key].replace("{n}", target)}
                </p>
              </div>
            );
          })}
        </div>
        <p className="border-t border-line px-4 pt-3 text-[13px] font-medium">
          {f.feasibility.groupsTitle}
        </p>
        <Table>
          <THead>
            <tr>
              <TH>{f.feasibility.cols.group}</TH>
              <TH align="right">{f.feasibility.cols.amount}</TH>
              <TH align="right">{f.feasibility.cols.share}</TH>
              <TH align="right">{f.feasibility.cols.range}</TH>
              <TH>{f.feasibility.cols.status}</TH>
            </tr>
          </THead>
          <tbody>
            {feas.groups.map((g) => (
              <TR key={g.key}>
                <TD className="font-medium">{f.feasibility.groups[g.key]}</TD>
                <TD align="right" className="num">
                  {money(g.amount)}
                </TD>
                <TD
                  align="right"
                  className={cn("num", g.status === "HIGH" && "font-semibold text-red-700")}
                >
                  {pctText(g.share)}
                </TD>
                <TD align="right" className="text-muted num">
                  {pctText(g.min)}–{pctText(g.max)}
                </TD>
                <TD>
                  <Badge tone={groupTone[g.status]}>{f.feasibility.groupStatus[g.status]}</Badge>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={f.sales.title}>
          <dl className="divide-y divide-line text-[13px]">
            {[
              [f.sales.forecast, money(result.revenue)],
              [f.sales.sold.replace("{n}", String(result.sold.units)), money(result.sold.value)],
              [f.sales.collected, money(result.sold.collected)],
              [f.sales.remaining, money(result.sold.remainingToSell)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-4 py-2">
                <dt className="text-muted">{k}</dt>
                <dd className="font-medium num">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title={f.scenarios.title} description={f.scenarios.body} className="lg:col-span-2">
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {scenario(f.scenarios.self, self, plan.sales_mode === "SELF")}
            {scenario(
              f.scenarios.agent.replace(
                "{n}",
                formatNumber(locale, plan.agent_commission_pct ?? 0, 2),
              ),
              agent,
              plan.sales_mode === "AGENT",
            )}
          </div>
        </Panel>
      </div>

      <Panel
        title={f.revenue}
        actions={
          canPlan ? (
            <Sheet
              title={f.addLine}
              triggerLabel={f.addLine}
              triggerVariant="secondary"
              triggerSize="xs"
            >
              {lineForm("REVENUE")}
            </Sheet>
          ) : null
        }
      >
        <Table>
          <THead>
            <tr>
              <TH>{f.cols.item}</TH>
              <TH>{f.cols.basis}</TH>
              <TH align="right">{f.cols.forecast}</TH>
              <TH align="right">{f.cols.share}</TH>
              {canPlan ? <TH /> : null}
            </tr>
          </THead>
          <tbody>{result.lines.filter((l) => l.kind === "REVENUE").map(lineRow)}</tbody>
        </Table>
      </Panel>

      <Panel
        title={f.costs}
        description={f.costsHint}
        actions={
          canPlan ? (
            <Sheet
              title={f.addLine}
              triggerLabel={f.addLine}
              triggerVariant="secondary"
              triggerSize="xs"
            >
              {lineForm("COST")}
            </Sheet>
          ) : null
        }
      >
        <Table>
          <THead>
            <tr>
              <TH>{f.cols.item}</TH>
              <TH>{f.cols.basis}</TH>
              <TH align="right">{f.cols.forecast}</TH>
              <TH align="right">{f.cols.share}</TH>
              <TH align="right">{f.cols.actual}</TH>
              <TH align="right">{f.cols.committed}</TH>
              <TH align="right">{f.cols.remaining}</TH>
              {canPlan ? <TH /> : null}
            </tr>
          </THead>
          <tbody>
            {result.lines.filter((l) => l.kind === "COST").map(lineRow)}
            {result.derived.map((d) => (
              <TR key={d.key} className="bg-subtle/50">
                <TD>
                  <p className="font-medium">{f.derived[d.key]}</p>
                  <p className="text-2xs text-muted">{f.derivedHint[d.key]}</p>
                </TD>
                <TD className="text-2xs text-muted">
                  {d.key === "AGENT"
                    ? rateText(plan.agent_commission_pct)
                    : d.key === "TRANSFER"
                      ? `${rateText(plan.transfer_fee_pct)} × ${rateText(plan.developer_transfer_share_pct)}`
                      : d.key === "BUSINESS_TAX"
                        ? rateText(plan.business_tax_pct)
                        : d.key === "INTEREST"
                          ? `${rateText(plan.loan_rate_pct ?? null)} ${f.perYear}`
                          : d.key === "LEASE_TAX"
                            ? rateText(plan.lease_tax_pct ?? null)
                            : d.key === "LEASE_FEE"
                              ? rateText(plan.lease_fee_pct ?? null)
                              : d.key === "CONSTRUCTION_TAX"
                                ? rateText(plan.construction_tax_pct ?? null)
                                : rateText(plan.income_tax_pct)}
                </TD>
                <TD align="right" className="font-medium num">
                  {money(d.amount)}
                </TD>
                <TD align="right" className="text-muted num">
                  {share(d.amount)}
                </TD>
                <TD colSpan={canPlan ? 4 : 3} />
              </TR>
            ))}
          </tbody>
          <TFoot>
            <tr>
              <TD className="font-semibold">{f.totalCosts}</TD>
              <TD />
              <TD align="right" className="font-semibold num">
                {money(totalCosts)}
              </TD>
              <TD align="right" className="num">
                {share(totalCosts)}
              </TD>
              <TD align="right" className="font-semibold num">
                {money(result.spent.actual)}
              </TD>
              <TD align="right" className="num">
                {money(result.spent.committed)}
              </TD>
              <TD colSpan={canPlan ? 2 : 1} />
            </tr>
          </TFoot>
        </Table>
        <p className="border-t border-line px-4 py-2 text-[10px] text-faint">{f.taxNote}</p>
      </Panel>

      <Panel
        title={f.cash.title}
        description={f.cash.body
          .replace("{amount}", money(Math.max(0, -cash.lowest.cumulative)))
          .replace("{month}", formatMonth(locale, `${cash.lowest.month}-01`))}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-2xs">
            <thead className="bg-subtle text-muted">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">{f.cash.month}</th>
                <th className="px-3 py-1.5 text-right font-medium">{f.cash.inflow}</th>
                <th className="px-3 py-1.5 text-right font-medium">{f.cash.outflow}</th>
                <th className="px-3 py-1.5 text-right font-medium">{f.cash.cumulative}</th>
                <th className="w-1/3 px-3 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(() => {
                const max = Math.max(1, ...cash.series.map((m) => Math.abs(m.cumulative)));
                return cash.series.map((m) => (
                  <tr
                    key={m.month}
                    className={cn(m.month === cash.lowest.month && "bg-amber-50/60")}
                  >
                    <td className="px-3 py-1">{formatMonth(locale, `${m.month}-01`)}</td>
                    <td className="px-3 py-1 text-right text-emerald-700 num">{money(m.inflow)}</td>
                    <td className="px-3 py-1 text-right text-red-700 num">{money(m.outflow)}</td>
                    <td
                      className={cn(
                        "px-3 py-1 text-right font-medium num",
                        m.cumulative < 0 && "text-red-700",
                      )}
                    >
                      {money(m.cumulative)}
                    </td>
                    <td className="px-3 py-1">
                      <div className="relative h-2 rounded bg-slate-100">
                        <div
                          className={cn(
                            "absolute top-0 h-2 rounded",
                            m.cumulative < 0 ? "right-1/2 bg-red-400" : "left-1/2 bg-emerald-500",
                          )}
                          style={{ width: `${(Math.abs(m.cumulative) / max) * 50}%` }}
                        />
                        <div className="absolute top-[-2px] left-1/2 h-3 w-px bg-slate-400" />
                      </div>
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-2 text-[10px] text-faint">{f.cash.note}</p>
      </Panel>
    </div>
  );
}

function PlanSheet({
  plan,
  hidden,
  t,
}: {
  plan: ForecastPlan;
  hidden: Record<string, string>;
  t: Awaited<ReturnType<typeof resolveLocale>>["t"];
}) {
  const f = t.forecast;
  return (
    <Sheet
      title={f.plan.title}
      triggerLabel={f.plan.open}
      triggerIcon={<Settings2 />}
      triggerVariant="secondary"
    >
      <ForecastPlanForm
        action={saveForecastPlan}
        hidden={hidden}
        plan={plan}
        labels={{
          ...f.plan,
          refs: [...f.plan.refs],
          self: f.scenarios.self,
          save: t.common.save,
        }}
      />
    </Sheet>
  );
}
