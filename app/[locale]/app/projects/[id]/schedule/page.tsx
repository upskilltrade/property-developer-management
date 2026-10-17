import type { Metadata } from "next";
import { CalendarRange } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { formatDate, toNumber } from "@/lib/format";
import {
  activityColumns,
  activityStatuses,
  plannedProgress,
  scheduleStages,
  scheduleState,
  todayIso,
  weightedProgress,
  type Activity,
} from "@/lib/schedule";
import { Kpi, KpiStrip } from "@/components/ui/kpi";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { Gantt, type GanttGroup } from "@/components/domain/gantt";
import { ProgressMatrix } from "@/components/domain/progress-matrix";

export const metadata: Metadata = { title: "Project schedule" };

export default async function ProjectSchedule({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ zoom?: string; stage?: string; status?: string; late?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id } = await params;
  const q = await searchParams;
  const { supabase } = await getSession(locale);
  const s = t.schedule;
  const today = todayIso();
  const zoom = q.zoom === "week" ? "week" : "month";

  const [{ data: project }, { data: units }, { data: actRows }, { count: pendingCount }] =
    await Promise.all([
      supabase.from("projects").select("target_completion_date").eq("id", id).maybeSingle(),
      supabase
        .from("units")
        .select("id,code,unit_financials(budget_amount)")
        .eq("project_id", id)
        .order("code"),
      supabase
        .from("schedule_activities")
        .select(activityColumns)
        .eq("project_id", id)
        .order("sequence"),
      supabase
        .from("progress_updates")
        .select("id", { count: "exact", head: true })
        .eq("project_id", id)
        .is("verified_at", null),
    ]);

  const acts = (actRows ?? []) as Activity[];
  const byUnit = new Map<string | null, Activity[]>();
  for (const a of acts) byUnit.set(a.unit_id, [...(byUnit.get(a.unit_id) ?? []), a]);
  const scheduledUnits = (units ?? []).filter((u) => byUnit.has(u.id));
  const projectWorks = byUnit.get(null) ?? [];

  if (!acts.length) {
    return (
      <Panel>
        <EmptyState icon={<CalendarRange />} title={s.noProjectSchedule} body={s.noScheduleBody} />
      </Panel>
    );
  }

  // Project progress = unit progress weighted by unit budget (equal weights when budgets are missing).
  const budgetOf = (u: (typeof scheduledUnits)[number]) => {
    const f = Array.isArray(u.unit_financials) ? u.unit_financials[0] : u.unit_financials;
    return toNumber(f?.budget_amount);
  };
  const useBudget = scheduledUnits.every((u) => budgetOf(u) > 0);
  const unitWeight = (u: (typeof scheduledUnits)[number]) => (useBudget ? budgetOf(u) : 1);
  const totalWeight = scheduledUnits.reduce((a, u) => a + unitWeight(u), 0) || 1;
  const work = (list: Activity[]) => list.filter((a) => !a.is_milestone);
  const progress =
    scheduledUnits.reduce(
      (a, u) => a + unitWeight(u) * weightedProgress(work(byUnit.get(u.id)!)),
      0,
    ) / totalWeight;
  const planned =
    scheduledUnits.reduce(
      (a, u) => a + unitWeight(u) * plannedProgress(work(byUnit.get(u.id)!), today),
      0,
    ) / totalWeight;
  const late = acts.filter((a) => {
    const st = scheduleState(a, today);
    return !st.done && (st.late || st.overdue);
  });
  const forecastFinish = acts.reduce<string | null>(
    (m, a) => (a.forecast_finish && (!m || a.forecast_finish > m) ? a.forecast_finish : m),
    null,
  );
  const target = project?.target_completion_date ?? null;
  const overTarget = target && forecastFinish && forecastFinish > target;

  // Filters apply to the Gantt rows; KPIs and the matrix always show the whole project.
  const keep = (a: Activity) => {
    if (q.stage && a.stage !== q.stage) return false;
    if (q.status && a.status !== q.status) return false;
    if (q.late === "1") {
      const st = scheduleState(a, today);
      return !st.done && (st.late || st.overdue);
    }
    return true;
  };
  const unitHref = (unitId: string) => `/${locale}/app/projects/${id}/units/${unitId}/schedule`;
  const groups: GanttGroup[] = [
    ...(projectWorks.length
      ? [
          {
            key: "project",
            label: s.projectWorks,
            summary: `${Math.round(weightedProgress(work(projectWorks)))}%`,
            activities: projectWorks.filter(keep),
          },
        ]
      : []),
    ...scheduledUnits.map((u) => ({
      key: u.id,
      label: u.code,
      href: unitHref(u.id),
      summary: `${Math.round(weightedProgress(work(byUnit.get(u.id)!)))}%`,
      activities: byUnit.get(u.id)!.filter(keep),
      open: scheduledUnits.length <= 3,
    })),
  ].filter((g) => g.activities.length);
  const date = (v: string | null | undefined) => formatDate(locale, v);

  return (
    <div className="space-y-4">
      <KpiStrip cols={5}>
        <Kpi
          label={s.kpi.progress}
          value={`${progress.toFixed(1)}%`}
          sub={`${s.projectWorks} ${Math.round(weightedProgress(work(projectWorks)))}%`}
        />
        <Kpi
          label={s.kpi.planned}
          value={`${planned.toFixed(1)}%`}
          sub={`${progress >= planned ? "+" : "−"}${Math.abs(progress - planned).toFixed(1)} pt`}
          tone={progress + 5 < planned ? "negative" : "positive"}
        />
        <Kpi label={s.kpi.late} value={late.length} tone={late.length ? "negative" : "positive"} />
        <Kpi
          label={s.kpi.forecast}
          value={date(forecastFinish)}
          sub={`${t.projects.fields.target}: ${date(target)}`}
          tone={overTarget ? "negative" : "default"}
        />
        <Kpi
          label={s.kpi.pending}
          value={pendingCount ?? 0}
          tone={pendingCount ? "brand" : "default"}
        />
      </KpiStrip>

      <Panel title={s.matrix} description={s.matrixHint}>
        <div className="p-3">
          <ProgressMatrix
            rows={scheduledUnits.map((u) => ({
              id: u.id,
              code: u.code,
              href: unitHref(u.id),
              activities: byUnit.get(u.id)!,
            }))}
            stageLabels={t.status.stage}
            labels={{ unit: s.cols.unit, progress: s.kpi.progress, delay: s.delay, days: s.days }}
          />
        </div>
      </Panel>

      <Panel
        title={s.title}
        description={s.projectSubtitle}
        bodyClassName="p-0"
        actions={
          <form className="flex flex-wrap items-center gap-2">
            <Select name="zoom" defaultValue={zoom} className="w-28">
              <option value="week">{s.zoomWeek}</option>
              <option value="month">{s.zoomMonth}</option>
            </Select>
            <Select name="stage" defaultValue={q.stage ?? ""} className="w-36">
              <option value="">{s.allStages}</option>
              {scheduleStages.map((st) => (
                <option key={st} value={st}>
                  {t.status.stage[st]}
                </option>
              ))}
            </Select>
            <Select name="status" defaultValue={q.status ?? ""} className="w-36">
              <option value="">{s.allStatuses}</option>
              {activityStatuses.map((st) => (
                <option key={st} value={st}>
                  {t.status.activity[st]}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-1.5 text-2xs">
              <input type="checkbox" name="late" value="1" defaultChecked={q.late === "1"} />
              {s.onlyLate}
            </label>
            <button
              type="submit"
              className="h-8 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium hover:bg-subtle"
            >
              {t.common.filter}
            </button>
          </form>
        }
      >
        {groups.length ? (
          <Gantt
            groups={groups}
            locale={locale}
            zoom={zoom}
            labels={{
              activity: s.cols.activity,
              delay: s.delay,
              days: s.days,
              baseline: s.baselineBar,
              today: s.today,
            }}
          />
        ) : (
          <EmptyState icon={<CalendarRange />} title={t.common.noResults} />
        )}
      </Panel>
    </div>
  );
}
