import { toNumber } from "@/lib/format";
import type { Tone } from "@/lib/status";

/** Columns every schedule screen reads from schedule_activities. */
export const activityColumns =
  "id,project_id,unit_id,code,name_th,name_en,stage,sequence,weight,baseline_start,baseline_finish,forecast_start,forecast_finish,actual_start,actual_finish,status,is_milestone,photos_required,reported_percent,verified_percent";

export type Activity = {
  id: string;
  project_id: string;
  unit_id: string | null;
  code: string;
  name_th: string;
  name_en: string;
  stage: string;
  sequence: number;
  weight: number | string;
  baseline_start: string | null;
  baseline_finish: string | null;
  forecast_start: string | null;
  forecast_finish: string | null;
  actual_start: string | null;
  actual_finish: string | null;
  status: string;
  is_milestone: boolean;
  photos_required: number;
  reported_percent: number | string | null;
  verified_percent: number | string;
};

export const activityStatuses = [
  "NOT_STARTED",
  "READY",
  "IN_PROGRESS",
  "INSPECTION",
  "COMPLETED",
  "BLOCKED",
  "REWORK",
] as const;

/** Stages shown as matrix columns, in construction order. */
export const scheduleStages = [
  "FOUNDATION",
  "STRUCTURE",
  "ROOF",
  "MEP",
  "FINISHING",
  "INSPECTION",
] as const;

const DAY = 86_400_000;
export const parseDate = (v: string | null | undefined) =>
  v ? new Date(`${v.slice(0, 10)}T00:00:00Z`).getTime() : null;
export const todayIso = () => new Date().toISOString().slice(0, 10);
export const daysBetween = (a: string | null | undefined, b: string | null | undefined) => {
  const x = parseDate(a);
  const y = parseDate(b);
  return x == null || y == null ? null : Math.round((y - x) / DAY);
};

export const activityName = (a: { name_th: string; name_en: string }, locale: string) =>
  (locale === "th" ? a.name_th : a.name_en) || a.name_en || a.name_th;

export const isDone = (a: Activity) =>
  a.status === "COMPLETED" || toNumber(a.verified_percent) >= 100;

/**
 * Days late against the untouched baseline. Uses the forecast finish, or today when an unfinished
 * activity is already past its forecast.
 */
export function delayDays(a: Activity, today = todayIso()) {
  if (!a.baseline_finish) return 0;
  let finish = a.actual_finish ?? a.forecast_finish ?? a.baseline_finish;
  if (!isDone(a) && (parseDate(today) ?? 0) > (parseDate(finish) ?? 0)) finish = today;
  return Math.max(0, daysBetween(a.baseline_finish, finish) ?? 0);
}

/** Late = finishing after baseline; overdue = unfinished and past its forecast finish. */
export function scheduleState(a: Activity, today = todayIso()) {
  const done = isDone(a);
  const delay = delayDays(a, today);
  const overdue = !done && (parseDate(today) ?? 0) > (parseDate(a.forecast_finish) ?? Infinity);
  const started = done || toNumber(a.verified_percent) > 0;
  return { done, delay, late: delay > 0, overdue, started };
}

export function statusTone(a: Activity, today = todayIso()): Tone {
  const s = scheduleState(a, today);
  if (a.status === "BLOCKED" || a.status === "REWORK") return "danger";
  if (s.done) return s.late ? "warning" : "success";
  if (s.late || s.overdue) return "danger";
  if (s.started) return "info";
  return "neutral";
}

/** Weighted verified progress of a set of activities (0–100). */
export function weightedProgress(acts: Activity[]) {
  const total = acts.reduce((a, x) => a + toNumber(x.weight), 0);
  if (!total) return acts.length ? (acts.filter(isDone).length / acts.length) * 100 : 0;
  return acts.reduce((a, x) => a + toNumber(x.weight) * toNumber(x.verified_percent), 0) / total;
}

/** Share of weight whose baseline should be done by `today` (linear within each activity). */
export function plannedProgress(acts: Activity[], today = todayIso()) {
  const t = parseDate(today) ?? 0;
  const total = acts.reduce((a, x) => a + toNumber(x.weight), 0);
  if (!total) return 0;
  const earned = acts.reduce((sum, x) => {
    const s = parseDate(x.baseline_start);
    const f = parseDate(x.baseline_finish);
    if (s == null || f == null) return sum;
    const share = t >= f ? 1 : t < s ? 0 : (t - s + DAY) / (f - s + DAY);
    return sum + toNumber(x.weight) * share;
  }, 0);
  return (earned / total) * 100;
}

export type MatrixCell = {
  pct: number;
  weight: number;
  late: boolean;
  started: boolean;
  done: boolean;
};

/** Unit × stage grid of weighted verified progress. */
export function stageMatrix(acts: Activity[], today = todayIso()) {
  const cells = new Map<string, MatrixCell>();
  for (const stage of scheduleStages) {
    const inStage = acts.filter((a) => a.stage === stage && !a.is_milestone);
    if (!inStage.length) continue;
    const states = inStage.map((a) => scheduleState(a, today));
    cells.set(stage, {
      pct: weightedProgress(inStage),
      weight: inStage.reduce((s, a) => s + toNumber(a.weight), 0),
      late: states.some((s) => !s.done && (s.late || s.overdue)),
      started: states.some((s) => s.started),
      done: states.every((s) => s.done),
    });
  }
  return cells;
}

export function cellTone(c: MatrixCell | undefined): Tone {
  if (!c) return "neutral";
  if (c.done) return "success";
  if (c.late) return "danger";
  if (c.started) return "info";
  return "neutral";
}

/** Earliest and latest dates across baseline, forecast and actual, padded to whole weeks. */
export function timelineRange(acts: Activity[], today = todayIso()) {
  const ts = acts
    .flatMap((a) => [
      a.baseline_start,
      a.baseline_finish,
      a.forecast_start,
      a.forecast_finish,
      a.actual_start,
      a.actual_finish,
    ])
    .map(parseDate)
    .filter((v): v is number => v != null);
  const t = parseDate(today) ?? Date.now();
  const min = Math.min(t, ...ts);
  const max = Math.max(t, ...ts);
  const start = min - ((new Date(min).getUTCDay() + 6) % 7) * DAY; // Monday
  const end = max + (7 - ((new Date(max).getUTCDay() + 6) % 7)) * DAY;
  return { start, end, days: Math.max(7, Math.round((end - start) / DAY)) };
}

export const DAY_MS = DAY;
