import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { Progress } from "@/components/ui/progress";
import {
  cellTone,
  delayDays,
  scheduleStages,
  stageMatrix,
  todayIso,
  weightedProgress,
  type Activity,
} from "@/lib/schedule";
import type { Tone } from "@/lib/status";

const cellClass: Record<Tone, string> = {
  success: "bg-emerald-500 text-white",
  danger: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-300",
  info: "bg-blue-100 text-blue-800",
  neutral: "bg-slate-100 text-faint",
  warning: "bg-amber-100 text-amber-900",
  accent: "bg-violet-100 text-violet-800",
};

export type MatrixRow = { id: string; code: string; href: string; activities: Activity[] };

/** Units × stages: each cell is the weighted verified % of that stage, coloured by state. */
export function ProgressMatrix({
  rows,
  stageLabels,
  labels,
}: {
  rows: MatrixRow[];
  stageLabels: Record<string, string>;
  labels: { unit: string; progress: string; delay: string; days: string };
}) {
  const today = todayIso();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-1 text-[12px]">
        <thead>
          <tr className="text-2xs text-muted">
            <th className="px-2 text-left font-medium">{labels.unit}</th>
            {scheduleStages.map((s) => (
              <th key={s} className="px-1 text-center font-medium">
                {stageLabels[s] ?? s}
              </th>
            ))}
            <th className="w-40 px-2 text-left font-medium">{labels.progress}</th>
            <th className="px-2 text-right font-medium">{labels.delay}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const cells = stageMatrix(r.activities, today);
            const work = r.activities.filter((a) => !a.is_milestone);
            const delay = Math.max(0, ...r.activities.map((a) => delayDays(a, today)));
            return (
              <tr key={r.id}>
                <td className="px-2 font-medium whitespace-nowrap">
                  <Link href={r.href} className="hover:text-brand hover:underline">
                    {r.code}
                  </Link>
                </td>
                {scheduleStages.map((s) => {
                  const c = cells.get(s);
                  return (
                    <td key={s} className="p-0">
                      <Link
                        href={r.href}
                        className={cn(
                          "block rounded px-1 py-2 text-center font-semibold num transition-opacity hover:opacity-80",
                          cellClass[cellTone(c)],
                        )}
                      >
                        {c ? `${Math.round(c.pct)}%` : "—"}
                      </Link>
                    </td>
                  );
                })}
                <td className="px-2">
                  <Progress value={work.length ? weightedProgress(work) : 0} />
                </td>
                <td
                  className={cn(
                    "px-2 text-right num",
                    delay ? "font-semibold text-red-700" : "text-faint",
                  )}
                >
                  {delay ? `+${delay} ${labels.days}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
