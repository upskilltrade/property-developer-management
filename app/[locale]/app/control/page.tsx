import type { Metadata } from "next";
import {
  AlertTriangle,
  CalendarRange,
  CircleDollarSign,
  FileClock,
  HardHat,
  Home,
  Wallet,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatMoneyCompact, formatNumber, formatPercent } from "@/lib/format";
import { soldStatuses } from "@/lib/status";
import { loadControlCenter, timelineColumns, type TimelineEvent } from "@/lib/control";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Kpi, KpiStrip } from "@/components/ui/kpi";
import { Panel } from "@/components/ui/panel";
import { Tabs } from "@/components/ui/tabs";
import { ProjectFilter } from "@/components/domain/project-filter";
import { RiskReviewPanel, type RiskReviewRow } from "@/components/domain/risk-review";
import { aiConfigured } from "@/lib/ai";
import { runRiskReview } from "./actions";
import {
  ApprovalsList,
  BudgetPanel,
  CashPanel,
  ExportLink,
  FunnelPanel,
  HealthPanel,
  HousesTable,
  IssuesList,
  TimelineList,
} from "@/components/domain/control-panels";

export const metadata: Metadata = { title: "Control center" };
// The AI risk review runs as a server action from this page.
export const maxDuration = 300;

const views = ["overview", "houses", "approvals", "issues", "risks", "timeline"] as const;
type View = (typeof views)[number];
const PAGE = 50;

export default async function ControlCenter({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    view?: string;
    project?: string;
    type?: string;
    limit?: string;
    review?: string;
  }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const q = await searchParams;
  const view: View = (views as readonly string[]).includes(q.view ?? "")
    ? (q.view as View)
    : "overview";
  const { supabase } = await getSession(locale);
  const appBase = `/${locale}/app`;
  const project = q.project || null;
  const c = t.control;

  const data = await loadControlCenter(supabase, appBase, project);
  const { projects, houses, approvals, issues, projectCode, unitCode } = data;

  // Export buttons only appear when the person may export that dataset for some project in scope.
  const exportable = async (dataset: string) => {
    const allowed = await Promise.all(
      projects.map((p) =>
        supabase.rpc("can_export", { target_project: p.id, dataset }).then((r) => r.data === true),
      ),
    );
    if (!allowed.some(Boolean)) return null;
    const qs = new URLSearchParams({ dataset });
    if (project) qs.set("project", project);
    return `${appBase}/control/export?${qs}`;
  };

  const href = (v: View, extra: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ view: v, ...extra });
    if (project) qs.set("project", project);
    return `${appBase}/control?${qs}`;
  };

  const soldCount = houses.filter((h) => soldStatuses.has(h.status)).length;
  const scheduled = projects.reduce((a, p) => a + p.scheduled, 0);
  const collected = projects.reduce((a, p) => a + p.collected, 0);
  const overdue = projects.reduce((a, p) => a + p.overdue, 0);
  const withSchedule = houses.filter((h) => h.hasSchedule);
  const progress = withSchedule.length
    ? withSchedule.reduce((a, h) => a + h.progress, 0) / withSchedule.length
    : 0;
  const planned = withSchedule.length
    ? withSchedule.reduce((a, h) => a + h.planned, 0) / withSchedule.length
    : 0;
  const critical = issues.filter((i) => i.critical).length;

  let body: React.ReactNode;
  if (view === "overview") {
    const [cashExport, costExport] = await Promise.all([
      exportable("receivables"),
      exportable("cost"),
    ]);
    body = (
      <div className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <HousesTable
            t={t}
            locale={locale}
            appBase={appBase}
            houses={houses}
            projectCode={projectCode}
            exportHref={null}
            compact
          />
          <div className="space-y-4">
            <IssuesList
              t={t}
              locale={locale}
              appBase={appBase}
              items={issues}
              projectCode={projectCode}
              unitCode={unitCode}
              limit={6}
              moreHref={href("issues")}
            />
            <ApprovalsList
              t={t}
              locale={locale}
              appBase={appBase}
              items={approvals}
              projectCode={projectCode}
              unitCode={unitCode}
              limit={6}
              moreHref={href("approvals")}
            />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <FunnelPanel t={t} locale={locale} appBase={appBase} funnel={data.funnel} />
          <CashPanel
            t={t}
            locale={locale}
            appBase={appBase}
            projects={projects}
            aging={data.aging}
            exportHref={cashExport}
          />
        </div>
        <BudgetPanel
          t={t}
          locale={locale}
          appBase={appBase}
          projects={projects}
          exportHref={costExport}
        />
        <HealthPanel t={t} locale={locale} appBase={appBase} projects={projects} />
      </div>
    );
  } else if (view === "houses") {
    body = (
      <HousesTable
        t={t}
        locale={locale}
        appBase={appBase}
        houses={houses}
        projectCode={projectCode}
        exportHref={await exportable("houses")}
      />
    );
  } else if (view === "approvals") {
    body = (
      <ApprovalsList
        t={t}
        locale={locale}
        appBase={appBase}
        items={approvals}
        projectCode={projectCode}
        unitCode={unitCode}
        exportHref={await exportable("approvals")}
      />
    );
  } else if (view === "issues") {
    body = (
      <IssuesList
        t={t}
        locale={locale}
        appBase={appBase}
        items={issues}
        projectCode={projectCode}
        unitCode={unitCode}
        exportHref={await exportable("issues")}
      />
    );
  } else if (view === "risks") {
    let reviewQuery = supabase
      .from("risk_reviews")
      .select(
        "id,summary_th,summary_en,risks,discarded,record_count,created_at,creator:profiles!risk_reviews_created_by_fkey(display_name)",
      )
      .order("created_at", { ascending: false })
      .limit(12);
    reviewQuery = project
      ? reviewQuery.eq("project_id", project)
      : reviewQuery.is("project_id", null);
    const { data: reviews } = await reviewQuery;
    body = (
      <RiskReviewPanel
        reviews={(reviews ?? []) as unknown as RiskReviewRow[]}
        selectedId={q.review}
        locale={locale}
        project={project}
        hrefFor={(id) => href("risks", { review: id })}
        action={runRiskReview}
        configured={aiConfigured()}
        t={t}
      />
    );
  } else {
    const limit = Math.min(Math.max(Number(q.limit) || PAGE, PAGE), 1000);
    let query = supabase
      .from("timeline_events")
      .select(timelineColumns)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (project) query = query.eq("project_id", project);
    if (q.type) query = query.eq("event_type", q.type);
    const [{ data: events }, timelineExport] = await Promise.all([query, exportable("timeline")]);
    const rows = (events ?? []) as TimelineEvent[];
    const types = Object.keys(t.status.timelineEvent);
    body = (
      <Panel
        title={c.timeline.title}
        actions={
          <>
            <form className="flex items-center gap-2">
              <input type="hidden" name="view" value="timeline" />
              {project ? <input type="hidden" name="project" value={project} /> : null}
              <select
                name="type"
                defaultValue={q.type ?? ""}
                aria-label={c.timeline.allTypes}
                className="h-7 rounded-md border border-line-strong bg-surface px-2 text-2xs"
              >
                <option value="">{c.timeline.allTypes}</option>
                {types.map((ty) => (
                  <option key={ty} value={ty}>
                    {label(t.status.timelineEvent, ty)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="h-7 rounded-md border border-line-strong bg-surface px-2 text-2xs font-medium hover:bg-subtle"
              >
                {t.common.filter}
              </button>
            </form>
            {timelineExport ? <ExportLink href={timelineExport} t={t} /> : null}
          </>
        }
      >
        <TimelineList
          t={t}
          locale={locale}
          appBase={appBase}
          events={rows.slice(0, limit)}
          projectCode={projectCode}
          unitCode={unitCode}
        />
        {rows.length > limit ? (
          <a
            href={href("timeline", {
              limit: String(limit + PAGE),
              ...(q.type ? { type: q.type } : {}),
            })}
            className="block border-t border-line px-4 py-2 text-center text-2xs font-medium text-brand hover:bg-subtle"
          >
            {c.timeline.more}
          </a>
        ) : null}
      </Panel>
    );
  }

  return (
    <>
      <PageHeader
        title={c.title}
        subtitle={c.subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink
              href={`/${locale}/report/monthly${project ? `?project=${project}` : ""}`}
              size="sm"
            >
              <CalendarRange />
              {t.monthlyReport.open}
            </ButtonLink>
            <ProjectFilter
              projects={data.allProjects.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }))}
              allLabel={c.allProjects}
            />
          </div>
        }
      />

      <KpiStrip>
        <Kpi
          label={c.kpi.sold}
          value={`${formatNumber(locale, soldCount)} / ${formatNumber(locale, houses.length)}`}
          sub={houses.length ? formatPercent(locale, soldCount / houses.length) : undefined}
          tone="brand"
          icon={<Home />}
          href={href("houses")}
        />
        <Kpi
          label={c.kpi.collected}
          value={formatMoneyCompact(locale, collected)}
          sub={
            scheduled
              ? `${formatPercent(locale, collected / scheduled)} ${c.kpi.ofUnits} ${formatMoneyCompact(locale, scheduled)}`
              : undefined
          }
          tone="positive"
          icon={<Wallet />}
          href={href("houses")}
        />
        <Kpi
          label={c.kpi.overdue}
          value={formatMoneyCompact(locale, overdue)}
          tone={overdue ? "negative" : "default"}
          icon={<CircleDollarSign />}
          href={href("issues")}
        />
        <Kpi
          label={c.kpi.progress}
          value={`${Math.round(progress)}%`}
          sub={`${c.kpi.vsPlan} ${Math.round(planned)}%`}
          tone={planned - progress > 5 ? "negative" : "default"}
          icon={<HardHat />}
          href={href("houses")}
        />
        <Kpi
          label={c.kpi.approvals}
          value={formatNumber(locale, approvals.length)}
          icon={<FileClock />}
          href={href("approvals")}
        />
        <Kpi
          label={c.kpi.critical}
          value={formatNumber(locale, critical)}
          sub={
            issues.length > critical ? `+${issues.length - critical} ${c.issues.watch}` : undefined
          }
          tone={critical ? "negative" : "default"}
          icon={<AlertTriangle />}
          href={href("issues")}
        />
      </KpiStrip>

      <div className="mt-4 mb-4">
        <Tabs
          active={view}
          items={views.map((v) => ({
            key: v,
            label: c.views[v],
            href: href(v),
            count: v === "approvals" ? approvals.length : v === "issues" ? critical : undefined,
          }))}
        />
      </div>

      {body}
    </>
  );
}
