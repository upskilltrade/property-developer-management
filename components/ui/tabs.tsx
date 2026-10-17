import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";

export function Tabs({
  items,
  active,
}: {
  items: { key: string; label: ReactNode; href: string; count?: number }[];
  active: string;
}) {
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-line" aria-label="Tabs">
      {items.map((item) => {
        const on = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors",
              on
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cn(
                  "rounded px-1.5 text-2xs num",
                  on ? "bg-brand-soft text-brand" : "bg-slate-100 text-muted",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
