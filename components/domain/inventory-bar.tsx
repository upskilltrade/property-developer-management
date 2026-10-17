import { unitStatusColor, unitStatuses } from "@/lib/status";
import { label } from "@/lib/i18n/label";
import { cn } from "@/components/ui/cn";

/** Stacked bar showing how a set of units splits across commercial statuses. */
export function InventoryBar({
  counts,
  labels,
  className,
}: {
  counts: Record<string, number>;
  labels: Record<string, string>;
  className?: string;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return <div className={cn("h-2 rounded-full bg-slate-100", className)} />;
  return (
    <div className={cn("flex h-2 overflow-hidden rounded-full bg-slate-100", className)}>
      {unitStatuses
        .filter((s) => counts[s])
        .map((s) => (
          <div
            key={s}
            title={`${label(labels, s)}: ${counts[s]}`}
            className={cn("h-full border-r border-white/60 last:border-0", unitStatusColor[s])}
            style={{ width: `${(counts[s] / total) * 100}%` }}
          />
        ))}
    </div>
  );
}

export function InventoryLegend({
  counts,
  labels,
}: {
  counts: Record<string, number>;
  labels: Record<string, string>;
}) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-2xs">
      {unitStatuses.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-sm", unitStatusColor[s])} />
          <span className="text-muted">{label(labels, s)}</span>
          <span className="font-semibold text-ink num">{counts[s] ?? 0}</span>
        </li>
      ))}
    </ul>
  );
}

export function countBy<T>(rows: T[], key: (row: T) => string | null | undefined) {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row);
    if (k) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
