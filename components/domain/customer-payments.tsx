import Link from "next/link";
import { Receipt, Upload, Wallet } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries/th";
import type { Locale } from "@/lib/i18n/config";
import { label } from "@/lib/i18n/label";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { paymentStatusTone } from "@/lib/payments";
import { todayIso } from "@/lib/schedule";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet } from "@/components/ui/sheet";
import { EvidenceUploadForm } from "@/components/domain/evidence-upload-form";

export type CustomerUnitPayments = {
  unit_id: string;
  organization_id: string;
  project_id: string;
  installments: {
    id: string;
    sequence: number;
    label_th: string;
    label_en: string;
    amount: number | string;
    due_date: string;
    paid_amount: number | string;
    outstanding: number | string;
    status: string;
    evidence: { id: string; status: string; review_note: string | null; submitted_at: string }[];
    receipts: { id: string; receipt_no: string; amount: number | string; paid_on: string }[];
  }[];
};

/** Customer's installments: status from verified payments, slip upload, rejections and receipts. */
export function CustomerPayments({
  data,
  locale,
  t,
  action,
}: {
  data: CustomerUnitPayments | undefined;
  locale: Locale;
  t: Pick<Dictionary, "portal" | "payments" | "status" | "schedule">;
  action: (fd: FormData) => Promise<void>;
}) {
  const c = t.portal.customer;
  const p = t.payments;
  const items = data?.installments ?? [];
  const outstanding = items.reduce((a, s) => a + toNumber(s.outstanding), 0);
  const next = items.find((s) => toNumber(s.outstanding) > 0);
  const today = todayIso();
  const money = (v: unknown) => formatMoney(locale, v);

  return (
    <Panel
      title={c.payments}
      actions={
        items.length ? (
          <span className="text-2xs text-muted">
            {c.outstanding}:{" "}
            <span className="font-semibold text-ink num">{money(outstanding)}</span>
          </span>
        ) : null
      }
    >
      {items.length && data ? (
        <ul className="divide-y divide-line">
          {items.map((s) => {
            const rejected = s.evidence.find((e) => e.status === "REJECTED");
            const canReport = toNumber(s.outstanding) > 0 && s.status !== "SUBMITTED";
            return (
              <li key={s.id} className="space-y-1.5 px-4 py-3 text-[13px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {s.sequence}. {locale === "th" ? s.label_th : s.label_en}
                      {next?.id === s.id ? (
                        <span className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] text-brand">
                          {c.nextDue}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-2xs text-muted">
                      {p.cols.due} {formatDate(locale, s.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold num">{money(s.amount)}</span>
                    <Badge tone={paymentStatusTone[s.status] ?? "neutral"}>
                      {label(t.status.payment, s.status)}
                    </Badge>
                  </div>
                </div>
                {rejected && s.status !== "PAID" && s.status !== "SUBMITTED" ? (
                  <p className="rounded bg-red-50 px-2 py-1 text-2xs text-red-800">
                    {c.rejected}
                    {rejected.review_note ? `: ${rejected.review_note}` : ""}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-3">
                  {s.receipts.map((r) => (
                    <Link
                      key={r.id}
                      href={`/${locale}/receipt/${r.id}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-2xs font-medium text-brand hover:underline"
                    >
                      <Receipt className="size-3.5" />
                      {r.receipt_no} · {money(r.amount)}
                    </Link>
                  ))}
                  {canReport ? (
                    <Sheet
                      title={c.submitEvidence}
                      triggerLabel={c.submitEvidence}
                      triggerIcon={<Upload />}
                      triggerSize="xs"
                      triggerVariant="secondary"
                    >
                      <EvidenceUploadForm
                        action={action}
                        hidden={{ locale, schedule_id: s.id }}
                        folder={`${data.organization_id}/${data.project_id}/${data.unit_id}/${s.id}`}
                        defaultAmount={toNumber(s.outstanding)}
                        defaultDate={today}
                        labels={{
                          hint: c.submitHint,
                          amount: p.fields.amount,
                          paidOn: p.fields.paidOn,
                          method: p.fields.method,
                          reference: p.fields.reference,
                          note: p.fields.note,
                          file: p.fields.file,
                          submit: c.submitEvidence,
                          uploadFailed: t.schedule.uploadFailed,
                          methods: t.status.paymentMethod,
                        }}
                      />
                    </Sheet>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={<Wallet />} title={c.noSchedule} />
      )}
    </Panel>
  );
}
