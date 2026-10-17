import type { ReactNode } from "react";
import { cn } from "./cn";

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn("min-w-0 rounded-lg border border-line bg-surface shadow-xs", className)}
    >
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            {title ? <h2 className="text-[13px] font-semibold text-ink">{title}</h2> : null}
            {description ? <p className="text-2xs text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Two-column label/value list used for record details. */
export function DetailList({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-line">
      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-[minmax(120px,40%)_1fr] gap-3 px-4 py-2 text-[13px]">
          <dt className="text-muted">{item.label}</dt>
          <dd className="min-w-0 font-medium text-ink num">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
