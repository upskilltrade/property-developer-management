import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";

export function PortalPlaceholder({
  icon,
  title,
  body,
  homeHref,
  homeLabel,
  tone = "brand",
}: {
  icon: ReactNode;
  title: string;
  body: string;
  homeHref?: string;
  homeLabel?: string;
  tone?: "brand" | "warning" | "danger";
}) {
  const ring = {
    brand: "bg-brand-soft text-brand",
    warning: "bg-amber-50 text-amber-600",
    danger: "bg-red-50 text-red-600",
  }[tone];
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-lg border border-line bg-surface p-8 text-center shadow-xs">
      <div
        className={`mx-auto mb-4 grid size-12 place-items-center rounded-full [&_svg]:size-6 ${ring}`}
      >
        {icon}
      </div>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">{body}</p>
      {homeHref && homeLabel ? (
        <ButtonLink href={homeHref} className="mt-6">
          {homeLabel}
        </ButtonLink>
      ) : null}
    </div>
  );
}
