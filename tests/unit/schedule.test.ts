import { describe, expect, it } from "vitest";
import {
  daysBetween,
  delayDays,
  plannedProgress,
  scheduleState,
  timelineRange,
  weightedProgress,
  type Activity,
} from "@/lib/schedule";

const act = (over: Partial<Activity>): Activity => ({
  id: "a",
  project_id: "p",
  unit_id: "u",
  code: "A",
  name_th: "ก",
  name_en: "A",
  stage: "STRUCTURE",
  sequence: 1,
  weight: 1,
  baseline_start: "2026-10-01",
  baseline_finish: "2026-10-10",
  forecast_start: "2026-10-01",
  forecast_finish: "2026-10-10",
  actual_start: null,
  actual_finish: null,
  status: "IN_PROGRESS",
  is_milestone: false,
  photos_required: 0,
  reported_percent: null,
  verified_percent: 0,
  ...over,
});

describe("schedule maths", () => {
  it("daysBetween counts calendar days", () => {
    expect(daysBetween("2026-10-01", "2026-10-10")).toBe(9);
    expect(daysBetween(null, "2026-10-10")).toBeNull();
  });

  it("an unfinished activity past its forecast is late until today", () => {
    const a = act({});
    expect(delayDays(a, "2026-10-08")).toBe(0);
    expect(delayDays(a, "2026-10-15")).toBe(5);
    expect(scheduleState(a, "2026-10-15")).toMatchObject({
      late: true,
      overdue: true,
      done: false,
    });
  });

  it("a finished activity is judged on its actual finish", () => {
    const a = act({ status: "COMPLETED", verified_percent: 100, actual_finish: "2026-10-12" });
    expect(delayDays(a, "2026-12-01")).toBe(2);
    expect(scheduleState(a, "2026-12-01")).toMatchObject({ done: true, overdue: false });
  });

  it("weightedProgress uses weights, or counts done activities when weights are zero", () => {
    expect(
      weightedProgress([
        act({ weight: 3, verified_percent: 100 }),
        act({ weight: 1, verified_percent: 0 }),
      ]),
    ).toBe(75);
    expect(weightedProgress([act({ weight: 0, status: "COMPLETED" }), act({ weight: 0 })])).toBe(
      50,
    );
    expect(weightedProgress([])).toBe(0);
  });

  it("plannedProgress is linear within the baseline, inclusive of both days", () => {
    const a = act({ baseline_start: "2026-10-01", baseline_finish: "2026-10-10" });
    expect(plannedProgress([a], "2026-09-30")).toBe(0);
    expect(plannedProgress([a], "2026-10-05")).toBe(50);
    expect(plannedProgress([a], "2026-10-10")).toBe(100);
  });

  it("timelineRange pads to Monday-to-Monday weeks", () => {
    const r = timelineRange([act({})], "2026-10-07");
    expect(new Date(r.start).getUTCDay()).toBe(1);
    expect(new Date(r.end).getUTCDay()).toBe(1);
    expect(r.days % 7).toBe(0);
  });
});
