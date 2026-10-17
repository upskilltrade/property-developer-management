import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="sticky top-0 z-[1] bg-subtle text-left text-2xs font-semibold tracking-wide text-muted uppercase">
      {children}
    </thead>
  );
}

export function TH({
  className,
  align,
  ...props
}: ComponentProps<"th"> & { align?: "right" | "center" }) {
  return (
    <th
      className={cn(
        "border-b border-line px-3 py-2 font-semibold whitespace-nowrap first:pl-4 last:pr-4",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
      {...props}
    />
  );
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      className={cn("border-b border-line last:border-0 hover:bg-slate-50/80", className)}
      {...props}
    />
  );
}

export function TD({
  className,
  align,
  ...props
}: ComponentProps<"td"> & { align?: "right" | "center" }) {
  return (
    <td
      className={cn(
        "h-10 px-3 py-1.5 align-middle whitespace-nowrap first:pl-4 last:pr-4",
        align === "right" && "text-right num",
        align === "center" && "text-center",
        className,
      )}
      {...props}
    />
  );
}

export function TFoot({ children }: { children: ReactNode }) {
  return <tfoot className="border-t-2 border-line bg-subtle font-semibold">{children}</tfoot>;
}
