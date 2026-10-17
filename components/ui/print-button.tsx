"use client";

import { Printer } from "lucide-react";
import { buttonClass } from "./button";

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={buttonClass("secondary", "sm", "print:hidden")}
    >
      <Printer />
      {label}
    </button>
  );
}
