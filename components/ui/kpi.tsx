import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "default" | "positive" | "negative" | "brand";

const valueTone: Record<Tone, string> = {
  default: "text-ink",
  positive: "text-emerald-700",
  negative: "text-red-700",
  brand: "text-brand",
};

/** Dense KPI strip: tiles share borders like a spreadsheet header row. */
export function KpiStrip({ children, cols = 6 }: { children: ReactNode; cols?: 4 | 5 | 6 }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-xs sm:grid-cols-3",
        cols === 4 && "lg:grid-cols-4",
        cols === 5 && "lg:grid-cols-5",
        cols === 6 && "lg:grid-cols-6",
      )}
    >
      {children}
    </div>
  );
}

export function Kpi({
  label,
  value,
  sub,
  tone = "default",
  icon,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-2 text-2xs font-medium tracking-wide text-muted uppercase">
        <span className="truncate">{label}</span>
        {icon ? <span className="text-faint [&_svg]:size-3.5">{icon}</span> : null}
      </div>
      <div className={cn("mt-1 truncate text-lg font-semibold num", valueTone[tone])}>{value}</div>
      {sub ? <div className="mt-0.5 truncate text-2xs text-muted">{sub}</div> : null}
    </div>
  );
}
