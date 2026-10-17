"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { cn } from "./cn";

type Messages = { saved: string; error: string; invalid: string; permission: string };

function stripFlashParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("saved");
  url.searchParams.delete("error");
  window.history.replaceState(null, "", url);
}

/** Toast driven by ?saved= / ?error= params that server actions append after redirecting. */
export function Flash({ messages }: { messages: Messages }) {
  const params = useSearchParams();
  const saved = params.get("saved");
  const error = params.get("error");
  const key = saved ? `saved:${saved}` : error ? `error:${error}` : null;

  const [seenKey, setSeenKey] = useState(key);
  const [dismissed, setDismissed] = useState(false);
  if (key !== seenKey) {
    setSeenKey(key);
    setDismissed(false);
  }

  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(
      () => {
        setDismissed(true);
        stripFlashParams();
      },
      saved ? 3500 : 7000,
    );
    return () => clearTimeout(timer);
  }, [key, saved]);

  if (!key || dismissed) return null;
  const ok = Boolean(saved);
  const text = ok
    ? messages.saved
    : error === "invalid"
      ? messages.invalid
      : error === "permission"
        ? messages.permission
        : messages.error;

  return (
    <div
      role="status"
      className={cn(
        "fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-2 rounded-lg border px-3 py-2.5 text-[13px] shadow-lg",
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-red-200 bg-red-50 text-red-900",
      )}
    >
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      )}
      <span className="flex-1">{text}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          stripFlashParams();
        }}
        className="opacity-60 hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
