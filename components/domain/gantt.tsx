import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import {
  activityName,
  DAY_MS,
  parseDate,
  scheduleState,
  timelineRange,
  todayIso,
  type Activity,
} from "@/lib/schedule";

export type GanttGroup = {
  key: string;
  label: ReactNode;
  href?: string;
  summary?: ReactNode;
  activities: Activity[];
  open?: boolean;
};

const barColor = (a: Activity, today: string) => {
  const s = scheduleState(a, today);
  if (s.done) return s.late ? "bg-amber-500" : "bg-emerald-500";
  if (s.late || s.overdue) return "bg-red-500";
  if (s.started) return "bg-brand";
  return "bg-slate-400";
};

/**
 * Timeline with a thin grey baseline bar under the forecast/actual bar, milestones as diamonds and
 * a "today" line. Groups collapse with <details>, so it works without client JavaScript.
 */
export function Gantt({
  groups,
  locale,
  zoom = "week",
  labels,
}: {
  groups: GanttGroup[];
  locale: string;
  zoom?: "week" | "month";
  labels: { activity: string; delay: string; days: string; baseline: string; today: string };
}) {
  const today = todayIso();
  const all = groups.flatMap((g) => g.activities);
  const { start, days } = timelineRange(all, today);
  const pxPerDay = zoom === "week" ? 16 : 5;
  const width = days * pxPerDay;
  const x = (iso: string | null | undefined) => {
    const t = parseDate(iso);
    return t == null ? null : ((t - start) / DAY_MS) * pxPerDay;
  };
  const span = (from: string | null, to: string | null) => {
    const a = x(from);
    const b = x(to);
    if (a == null || b == null) return null;
    return { left: a, width: Math.max(pxPerDay, b - a + pxPerDay) };
  };
  const todayX = x(today) ?? 0;

  // Header ticks: months always; week starts when zoomed in.
  const months: { left: number; label: string }[] = [];
  const weeks: number[] = [];
  const fmtMonth = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
  for (let d = 0; d <= days; d++) {
    const date = new Date(start + d * DAY_MS);
    if (date.getUTCDate() === 1 || d === 0) {
      // Drop the partial first month's label when the next month starts right after it.
      if (months.length === 1 && d * pxPerDay - months[0].left < 56) months.pop();
      months.push({ left: d * pxPerDay, label: fmtMonth.format(date) });
    }
    if (zoom === "week" && date.getUTCDay() === 1) weeks.push(d * pxPerDay);
  }

  const row = (a: Activity) => {
    const s = scheduleState(a, today);
    const base = span(a.baseline_start, a.baseline_finish);
    const plan = span(a.actual_start ?? a.forecast_start, a.actual_finish ?? a.forecast_finish);
    return (
      <div key={a.id} className="flex h-7 border-b border-line/60 last:border-0 hover:bg-subtle/60">
        <div className="sticky left-0 z-10 flex w-60 shrink-0 items-center gap-2 border-r border-line bg-surface px-3 text-2xs">
          <span className="w-8 shrink-0 font-mono text-faint">{a.code}</span>
          <span className={cn("truncate", s.late && !s.done && "text-red-700")}>
            {activityName(a, locale)}
          </span>
          {s.delay > 0 ? (
            <span className="ml-auto shrink-0 font-medium text-red-700 num">+{s.delay}</span>
          ) : null}
        </div>
        <div className="relative shrink-0" style={{ width }}>
          {a.is_milestone ? (
            (() => {
              const m = x(a.forecast_finish ?? a.baseline_finish);
              return m == null ? null : (
                <span
                  title={activityName(a, locale)}
                  className={cn(
                    "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white",
                    barColor(a, today),
                  )}
                  style={{ left: m + pxPerDay / 2 }}
                />
              );
            })()
          ) : (
            <>
              {base ? (
                <span
                  title={labels.baseline}
                  className="absolute bottom-1 h-1 rounded-full bg-slate-300"
                  style={base}
                />
              ) : null}
              {plan ? (
                <span
                  className={cn(
                    "absolute top-1 h-3.5 overflow-hidden rounded-sm opacity-90",
                    barColor(a, today),
                  )}
                  style={plan}
                  title={`${a.code} · ${activityName(a, locale)}${s.delay ? ` · ${labels.delay} ${s.delay} ${labels.days}` : ""}`}
                >
                  {!s.done && Number(a.verified_percent) > 0 ? (
                    <span
                      className="block h-full bg-black/20"
                      style={{ width: `${Number(a.verified_percent)}%` }}
                    />
                  ) : null}
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="overflow-x-auto">
      <div className="relative min-w-full" style={{ width: width + 240 }}>
        <div className="sticky top-0 z-20 flex h-9 border-b border-line bg-subtle text-2xs text-muted">
          <div className="sticky left-0 z-10 flex w-60 shrink-0 items-center border-r border-line bg-subtle px-3 font-medium uppercase">
            {labels.activity}
          </div>
          <div className="relative shrink-0" style={{ width }}>
            {months.map((m) => (
              <span
                key={m.left}
                className="absolute top-0 h-full border-l border-line pl-1 leading-9 whitespace-nowrap"
                style={{ left: m.left }}
              >
                {m.label}
              </span>
            ))}
          </div>
        </div>

        <div className="relative">
          <div
            className="pointer-events-none absolute inset-y-0 z-0"
            style={{ left: 240, width }}
            aria-hidden
          >
            {weeks.map((w) => (
              <span
                key={w}
                className="absolute inset-y-0 border-l border-line/50"
                style={{ left: w }}
              />
            ))}
            {months.map((m) => (
              <span
                key={m.left}
                className="absolute inset-y-0 border-l border-line"
                style={{ left: m.left }}
              />
            ))}
            <span
              className="absolute inset-y-0 z-10 border-l-2 border-red-500/70"
              style={{ left: todayX + pxPerDay / 2 }}
              title={labels.today}
            />
          </div>

          {groups.map((g) => (
            <details key={g.key} open={g.open ?? true} className="group relative">
              <summary className="flex h-8 cursor-pointer list-none border-b border-line bg-subtle/70 [&::-webkit-details-marker]:hidden">
                <div className="sticky left-0 z-10 flex w-60 shrink-0 items-center gap-2 border-r border-line bg-subtle px-3 text-[12px] font-semibold">
                  <span className="text-faint transition-transform group-open:rotate-90">▸</span>
                  {g.href ? (
                    <Link href={g.href} className="truncate hover:text-brand hover:underline">
                      {g.label}
                    </Link>
                  ) : (
                    <span className="truncate">{g.label}</span>
                  )}
                  {g.summary ? (
                    <span className="ml-auto shrink-0 font-normal">{g.summary}</span>
                  ) : null}
                </div>
                <div className="shrink-0" style={{ width }} />
              </summary>
              {g.activities.map(row)}
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
