"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() =>
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs text-brand hover:bg-brand-soft"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {label}
    </button>
  );
}
