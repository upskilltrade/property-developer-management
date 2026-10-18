"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, X } from "lucide-react";
import { buttonClass } from "./button";
import { cn } from "./cn";

/**
 * Right-hand drawer built on <dialog>. Holds a server-action form; closes automatically when the
 * action redirects back with new search params (saved / error flash).
 */
export function Sheet({
  title,
  description,
  triggerLabel,
  triggerIcon = <Plus />,
  triggerVariant = "primary",
  triggerSize = "sm",
  width = "md",
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  triggerLabel: ReactNode;
  triggerIcon?: ReactNode;
  triggerVariant?: "primary" | "secondary" | "ghost" | "danger";
  triggerSize?: "xs" | "sm" | "md";
  width?: "md" | "lg";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const params = useSearchParams();

  useEffect(() => {
    ref.current?.close();
  }, [params]);

  return (
    <>
      <button
        type="button"
        className={buttonClass(triggerVariant, triggerSize)}
        onClick={() => ref.current?.showModal()}
      >
        {triggerIcon}
        {triggerLabel}
      </button>
      <dialog
        ref={ref}
        onClick={(e) => {
          if (e.target === ref.current) ref.current.close();
        }}
        className={cn(
          // text-left: a sheet opened from a right-aligned table cell must not inherit its alignment.
          "fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full whitespace-normal border-l border-line bg-surface p-0 text-left text-ink shadow-2xl",
          "backdrop:bg-slate-900/40 backdrop:backdrop-blur-[1px]",
          width === "md" ? "max-w-md" : "max-w-2xl",
        )}
      >
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold">{title}</h2>
              {description ? <p className="mt-0.5 text-2xs text-muted">{description}</p> : null}
            </div>
            <button
              type="button"
              aria-label="Close"
              className={buttonClass("ghost", "sm", "-mr-2 px-2")}
              onClick={() => ref.current?.close()}
            >
              <X />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </div>
      </dialog>
    </>
  );
}

/** Sticky footer row for forms inside a Sheet. */
export function SheetFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-5 mt-5 flex justify-end gap-2 border-t border-line bg-surface px-5 py-3">
      {children}
    </div>
  );
}
