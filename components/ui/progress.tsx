import { cn } from "./cn";

export function Progress({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : "bg-brand")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-9 text-right text-2xs font-medium text-ink-2 num">{Math.round(pct)}%</span>
    </div>
  );
}
