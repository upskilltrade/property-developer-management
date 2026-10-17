import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  CalendarCheck,
  CircleDollarSign,
  FileClock,
  Home,
  KeyRound,
  Wallet,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import {
  formatDate,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  toNumber,
} from "@/lib/format";
import { soldStatuses, toneOf } from "@/lib/status";
import { PageHeader } from "@/components/ui/page-header";
import { Kpi, KpiStrip } from "@/components/ui/kpi";
import { DetailList, Panel } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { ButtonLink } from "@/components/ui/button";
import { countBy, InventoryBar, InventoryLegend } from "@/components/domain/inventory-bar";
import {
  activityColumns,
  activityName,
  daysBetween,
  scheduleState,
  todayIso,
  weightedProgress,
  type Activity,
} from "@/lib/schedule";

export const metadata: Metadata = { title: "Dashboard" };

type Portfolio = {
  total_projects: number | string | null;
  total_units: number | string | null;
  available_units: number | string | null;
  sold_contracted_units: number | string | null;
  listed_value: number | string | null;
};

export default async function Dashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await resolveLocale(params);
  const { supabase, displayName } = await getSession(locale);
  const base = `/${locale}/app`;

  const [
    { data: projects },
    { data: portfolioRows },
    { data: units },
    { data: finance },
    { data: openDocs },
    { data: openContracts },
    { data: scheduleRows },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id,code,name,status,currency_code,target_completion_date")
      .order("code"),
    supabase.rpc("get_portfolio_dashboard"),
    supabase.from("units").select("id,code,project_id,status,list_price").limit(5000),
    supabase
      .from("financial_documents")
      .select("project_id,document_type,amount,status,settled_amount")
      .in("status", ["APPROVED", "POSTED"])
      .limit(5000),
    supabase
      .from("financial_documents")
      .select("id,project_id,document_no,document_type,amount,status,document_date")
      .in("status", ["DRAFT", "APPROVED"])
      .order("document_date", { ascending: false })
      .limit(200),
    supabase
      .from("procurement_contracts")
      .select("id,project_id,contract_no,vendor_name,amount,status")
      .eq("status", "DRAFT")
      .limit(50),
    supabase.from("schedule_activities").select(activityColumns).limit(5000),
  ]);

  const allUnits = units ?? [];
  const portfolio = (portfolioRows?.[0] ?? null) as Portfolio | null;
  const totalUnits = toNumber(portfolio?.total_units ?? allUnits.length);
  const available = toNumber(
    portfolio?.available_units ?? allUnits.filter((u) => u.status === "AVAILABLE").length,
  );
  const sold = toNumber(
    portfolio?.sold_contracted_units ?? allUnits.filter((u) => soldStatuses.has(u.status)).length,
  );
  const listedValue = toNumber(
    portfolio?.listed_value ?? allUnits.reduce((a, u) => a + toNumber(u.list_price), 0),
  );

  const docs = finance ?? [];
  const sumWhere = (pred: (d: (typeof docs)[number]) => boolean, outstanding = false) =>
    docs
      .filter(pred)
      .reduce(
        (a, d) =>
          a +
          (outstanding
            ? Math.max(0, toNumber(d.amount) - toNumber(d.settled_amount))
            : toNumber(d.amount)),
        0,
      );
  const cashIn = sumWhere((d) => d.document_type === "RECEIPT" && d.status === "POSTED");
  const cashOut = sumWhere((d) => d.document_type === "PAYMENT" && d.status === "POSTED");
  const ar = sumWhere((d) => d.document_type === "AR", true);
  const ap = sumWhere((d) => d.document_type === "AP", true);
  const committed = sumWhere((d) => d.document_type === "COMMITMENT");
  const netCash = cashIn - cashOut;

  const pendingDocs = (openDocs ?? []).filter(
    (d) =>
      d.status === "DRAFT" || (d.status === "APPROVED" && ["AP", "AR"].includes(d.document_type)),
  );
  const pendingContracts = openContracts ?? [];
  const projectById = new Map((projects ?? []).map((p) => [p.id, p]));

  const rows = (projects ?? []).map((p) => {
    const pu = allUnits.filter((u) => u.project_id === p.id);
    const soldCount = pu.filter((u) => soldStatuses.has(u.status)).length;
    return {
      ...p,
      unitCount: pu.length,
      counts: countBy(pu, (u) => u.status),
      soldRatio: pu.length ? soldCount / pu.length : 0,
      value: pu.reduce((a, u) => a + toNumber(u.list_price), 0),
    };
  });

  // Construction: verified progress per project (units weighted equally), late activities and
  // milestones due in the next 14 days.
  const today = todayIso();
  const acts = (scheduleRows ?? []) as Activity[];
  const construction = (projects ?? [])
    .map((p) => {
      const pa = acts.filter((a) => a.project_id === p.id);
      const unitIds = [...new Set(pa.map((a) => a.unit_id).filter(Boolean))] as string[];
      const progress = unitIds.length
        ? unitIds.reduce(
            (sum, uid) =>
              sum + weightedProgress(pa.filter((a) => a.unit_id === uid && !a.is_milestone)),
            0,
          ) / unitIds.length
        : 0;
      const late = pa.filter((a) => {
        const st = scheduleState(a, today);
        return !st.done && (st.late || st.overdue);
      }).length;
      return { ...p, units: unitIds.length, progress, late };
    })
    .filter((p) => p.units);
  const unitCodeById = new Map(allUnits.map((u) => [u.id, u.code]));
  const milestones = acts
    .filter((a) => {
      if (!a.is_milestone || scheduleState(a, today).done) return false;
      const d = daysBetween(today, a.forecast_finish);
      return d != null && d >= 0 && d <= 14;
    })
    .sort((a, b) => (a.forecast_finish ?? "").localeCompare(b.forecast_finish ?? ""))
    .slice(0, 8);

  return (
    <>
      <PageHeader
        title={t.dashboard.title}
        subtitle={`${t.dashboard.greeting} ${displayName} · ${t.dashboard.subtitle}`}
      />

      <KpiStrip>
        <Kpi
          label={t.dashboard.kpi.projects}
          value={formatNumber(locale, portfolio?.total_projects ?? rows.length)}
          icon={<Building2 />}
        />
        <Kpi
          label={t.dashboard.kpi.units}
          value={formatNumber(locale, totalUnits)}
          icon={<Home />}
        />
        <Kpi
          label={t.dashboard.kpi.available}
          value={formatNumber(locale, available)}
          sub={totalUnits ? formatPercent(locale, available / totalUnits) : undefined}
          tone="positive"
          icon={<KeyRound />}
        />
        <Kpi
          label={t.dashboard.kpi.sold}
          value={formatNumber(locale, sold)}
          sub={totalUnits ? formatPercent(locale, sold / totalUnits) : undefined}
          tone="brand"
        />
        <Kpi
          label={t.dashboard.kpi.listedValue}
          value={formatMoneyCompact(locale, listedValue)}
          sub={formatMoney(locale, listedValue)}
          icon={<CircleDollarSign />}
        />
        <Kpi
          label={t.dashboard.kpi.netCash}
          value={formatMoneyCompact(locale, netCash)}
          sub={`${t.dashboard.kpi.cashIn} ${formatMoneyCompact(locale, cashIn)} · ${t.dashboard.kpi.cashOut} ${formatMoneyCompact(locale, cashOut)}`}
          tone={netCash < 0 ? "negative" : "positive"}
          icon={<Wallet />}
        />
      </KpiStrip>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
        <Panel
          title={t.dashboard.portfolio}
          actions={
            <ButtonLink href={`${base}/projects`} variant="ghost" size="xs">
              {t.nav.allProjects}
              <ArrowUpRight />
            </ButtonLink>
          }
        >
          {rows.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>{t.common.code}</TH>
                  <TH>{t.projects.fields.name}</TH>
                  <TH>{t.common.status}</TH>
                  <TH align="right">{t.projects.fields.units}</TH>
                  <TH className="min-w-40">{t.dashboard.inventory}</TH>
                  <TH align="right">{t.dashboard.soldRatio}</TH>
                  <TH align="right">{t.projects.fields.value}</TH>
                  <TH align="right">{t.projects.fields.target}</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-mono text-2xs text-muted">{p.code}</TD>
                    <TD>
                      <Link
                        href={`${base}/projects/${p.id}`}
                        className="font-medium text-ink hover:text-brand hover:underline"
                      >
                        {p.name}
                      </Link>
                    </TD>
                    <TD>
                      <Badge tone={toneOf(p.status)}>{label(t.status.project, p.status)}</Badge>
                    </TD>
                    <TD align="right">{formatNumber(locale, p.unitCount)}</TD>
                    <TD>
                      <InventoryBar counts={p.counts} labels={t.status.unit} />
                    </TD>
                    <TD align="right">{formatPercent(locale, p.soldRatio)}</TD>
                    <TD align="right">{formatMoney(locale, p.value, p.currency_code ?? "THB")}</TD>
                    <TD align="right" className="text-muted">
                      {formatDate(locale, p.target_completion_date)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState
              title={t.projects.empty}
              body={t.projects.emptyBody}
              action={
                <ButtonLink href={`${base}/projects`} variant="primary">
                  {t.projects.new}
                </ButtonLink>
              }
            />
          )}
        </Panel>

        <div className="space-y-4">
          <Panel
            title={t.dashboard.pending}
            actions={
              <Badge tone={pendingDocs.length + pendingContracts.length ? "warning" : "neutral"}>
                {pendingDocs.length + pendingContracts.length}
              </Badge>
            }
          >
            {pendingDocs.length + pendingContracts.length ? (
              <ul className="divide-y divide-line">
                {[
                  ...pendingDocs.slice(0, 6).map((d) => ({
                    id: d.id,
                    href: `${base}/projects/${d.project_id}/finance`,
                    no: d.document_no,
                    kind: label(t.status.documentType, d.document_type),
                    project: projectById.get(d.project_id)?.code,
                    amount: d.amount,
                    status: d.status,
                  })),
                  ...pendingContracts.slice(0, 4).map((c) => ({
                    id: c.id,
                    href: `${base}/projects/${c.project_id}/finance?tab=contracts`,
                    no: c.contract_no,
                    kind: c.vendor_name,
                    project: projectById.get(c.project_id)?.code,
                    amount: c.amount,
                    status: c.status,
                  })),
                ].map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50"
                    >
                      <FileClock className="size-4 shrink-0 text-amber-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">
                          <span className="font-mono text-2xs text-muted">{item.no}</span> ·{" "}
                          {item.kind}
                        </p>
                        <p className="text-2xs text-muted">
                          {item.project} · {label(t.status.document, item.status)}
                        </p>
                      </div>
                      <span className="text-[13px] font-semibold num">
                        {formatMoneyCompact(locale, item.amount)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-2xs text-muted">
                {t.dashboard.pendingEmpty}
              </p>
            )}
          </Panel>

          <Panel title={t.dashboard.finance}>
            <DetailList
              items={[
                {
                  label: t.dashboard.kpi.cashIn,
                  value: <span className="text-emerald-700">{formatMoney(locale, cashIn)}</span>,
                },
                {
                  label: t.dashboard.kpi.cashOut,
                  value: <span className="text-red-700">{formatMoney(locale, cashOut)}</span>,
                },
                { label: t.dashboard.kpi.ar, value: formatMoney(locale, ar) },
                { label: t.dashboard.kpi.ap, value: formatMoney(locale, ap) },
                { label: t.dashboard.kpi.committed, value: formatMoney(locale, committed) },
              ]}
            />
          </Panel>

          <Panel title={t.dashboard.inventory} bodyClassName="space-y-3 p-4">
            <InventoryBar
              counts={countBy(allUnits, (u) => u.status)}
              labels={t.status.unit}
              className="h-3"
            />
            <InventoryLegend counts={countBy(allUnits, (u) => u.status)} labels={t.status.unit} />
          </Panel>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
        <Panel title={t.dashboard.construction} description={t.dashboard.constructionHint}>
          {construction.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>{t.projects.title}</TH>
                  <TH align="right">{t.dashboard.kpi.units}</TH>
                  <TH className="w-56">{t.dashboard.avgProgress}</TH>
                  <TH align="right">{t.dashboard.lateActivities}</TH>
                </tr>
              </THead>
              <tbody>
                {construction.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <Link
                        href={`${base}/projects/${p.id}/schedule`}
                        className="font-medium hover:text-brand hover:underline"
                      >
                        {p.name}
                      </Link>
                      <p className="font-mono text-[10px] text-faint">{p.code}</p>
                    </TD>
                    <TD align="right" className="num">
                      {p.units}
                    </TD>
                    <TD>
                      <Progress value={p.progress} />
                    </TD>
                    <TD
                      align="right"
                      className={p.late ? "font-semibold text-red-700 num" : "text-faint num"}
                    >
                      {p.late || "—"}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={<Building2 />} title={t.dashboard.noSchedules} />
          )}
        </Panel>
        <Panel title={t.dashboard.nextMilestones}>
          {milestones.length ? (
            <ul className="divide-y divide-line">
              {milestones.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {projectById.get(m.project_id)?.code} ·{" "}
                      {m.unit_id ? (unitCodeById.get(m.unit_id) ?? "") : ""}
                    </p>
                    <p className="truncate text-2xs text-muted">◆ {activityName(m, locale)}</p>
                  </div>
                  <span className="shrink-0 text-2xs text-muted">
                    {formatDate(locale, m.forecast_finish)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<CalendarCheck />} title={t.dashboard.noMilestones} />
          )}
        </Panel>
      </div>
    </>
  );
}
