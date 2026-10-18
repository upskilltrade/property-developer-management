"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Labels = {
  start: string;
  creating: string;
  scan: string;
  waiting: string;
  paid: string;
  failed: string;
  expired: string;
  retry: string;
  noQr: string;
  note: string;
  errors: Record<string, string>;
};

type State =
  | { step: "idle" }
  | { step: "creating" }
  | { step: "pending"; id: string; hasQr: boolean; expiresAt: string | null }
  | { step: "done"; status: "SUCCESSFUL" | "FAILED" | "EXPIRED" }
  | { step: "error"; message: string };

/**
 * Pay an installment with an Omise PromptPay QR. The page checks the status every few seconds;
 * the server confirms with Omise before anything is recorded, and the receipt appears on refresh.
 */
export function OnlinePay({
  locale,
  scheduleId,
  amount,
  amountLabel,
  labels,
}: {
  locale: string;
  scheduleId: string;
  amount: number;
  amountLabel: string;
  labels: Labels;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>({ step: "idle" });
  const [qrFailed, setQrFailed] = useState(false);
  const base = `/${locale}/app/customer/pay`;

  async function start() {
    setState({ step: "creating" });
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schedule_id: scheduleId, amount }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        id?: string;
        has_qr?: boolean;
        expires_at?: string | null;
        error?: string;
      };
      if (!res.ok || !json.id)
        return setState({
          step: "error",
          message: labels.errors[json.error ?? ""] ?? labels.errors.generic,
        });
      setQrFailed(false);
      setState({
        step: "pending",
        id: json.id,
        hasQr: Boolean(json.has_qr),
        expiresAt: json.expires_at ?? null,
      });
    } catch {
      setState({ step: "error", message: labels.errors.generic });
    }
  }

  const pendingId = state.step === "pending" ? state.id : null;
  useEffect(() => {
    if (!pendingId) return;
    const timer = setInterval(async () => {
      const res = await fetch(`${base}/${pendingId}`, { cache: "no-store" }).catch(() => null);
      const json = res?.ok ? ((await res.json()) as { status?: string }) : null;
      if (
        json?.status === "SUCCESSFUL" ||
        json?.status === "FAILED" ||
        json?.status === "EXPIRED"
      ) {
        setState({ step: "done", status: json.status });
        if (json.status === "SUCCESSFUL") router.refresh();
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [pendingId, base, router]);

  if (state.step === "idle" || state.step === "error")
    return (
      <div className="space-y-3 text-[13px]">
        <p className="text-2xl font-semibold num">{amountLabel}</p>
        <p className="text-2xs text-muted">{labels.note}</p>
        {state.step === "error" ? (
          <p className="rounded bg-red-50 px-2 py-1 text-2xs text-red-800">{state.message}</p>
        ) : null}
        <Button variant="primary" onClick={start}>
          {labels.start}
        </Button>
      </div>
    );

  if (state.step === "creating")
    return (
      <p className="flex items-center gap-2 text-[13px] text-muted">
        <Loader2 className="size-4 animate-spin" />
        {labels.creating}
      </p>
    );

  if (state.step === "pending")
    return (
      <div className="space-y-3 text-center text-[13px]">
        <p className="font-medium">{labels.scan}</p>
        {state.hasQr && !qrFailed ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by our own route from Omise
          <img
            src={`${base}/${state.id}/qr`}
            alt="PromptPay QR"
            onError={() => setQrFailed(true)}
            className="mx-auto w-full max-w-64 rounded-lg border border-line bg-white p-2"
          />
        ) : (
          <p className="text-2xs text-amber-800">{labels.noQr}</p>
        )}
        <p className="text-2xl font-semibold num">{amountLabel}</p>
        <p className="flex items-center justify-center gap-2 text-2xs text-muted">
          <Loader2 className="size-3.5 animate-spin" />
          {labels.waiting}
        </p>
      </div>
    );

  return (
    <div className="space-y-3 text-center text-[13px]">
      {state.status === "SUCCESSFUL" ? (
        <p className="flex items-center justify-center gap-2 font-medium text-emerald-700">
          <CheckCircle2 className="size-5" />
          {labels.paid}
        </p>
      ) : (
        <>
          <p className="flex items-center justify-center gap-2 font-medium text-red-700">
            <XCircle className="size-5" />
            {state.status === "FAILED" ? labels.failed : labels.expired}
          </p>
          <Button onClick={start}>{labels.retry}</Button>
        </>
      )}
    </div>
  );
}
