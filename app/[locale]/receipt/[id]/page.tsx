import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatMoney } from "@/lib/format";
import { PrintButton } from "@/components/ui/print-button";

export const metadata: Metadata = { title: "Receipt" };

type ReceiptData = {
  receipt_no: string;
  amount: number | string;
  paid_on: string;
  method: string;
  reference: string | null;
  status: string;
  verified_at: string;
  installment_th: string;
  installment_en: string;
  unit_code: string;
  project_name: string;
  organization_name: string;
  customer_name: string | null;
};

/** Printable receipt for a Finance-verified payment; the RPC checks staff or owning customer. */
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id } = await params;
  const { supabase } = await getSession(locale);
  const r = t.receipt;
  const { data } = await supabase.rpc("get_receipt", { target_payment: id });
  const receipt = data as ReceiptData | null;

  if (!receipt) {
    return (
      <p className="mx-auto mt-16 max-w-md text-center text-[13px] text-muted">{r.notFound}</p>
    );
  }
  const rows: [string, string][] = [
    [r.receivedFrom, receipt.customer_name ?? "—"],
    [r.property, `${receipt.project_name} · ${receipt.unit_code}`],
    [r.item, locale === "th" ? receipt.installment_th : receipt.installment_en],
    [r.method, label(t.status.paymentMethod, receipt.method)],
    [r.reference, receipt.reference ?? "—"],
  ];

  return (
    <main className="mx-auto my-8 max-w-2xl px-4 print:my-0">
      <div className="mb-3 flex justify-end">
        <PrintButton label={r.print} />
      </div>
      <article className="relative overflow-hidden rounded-lg border border-line bg-surface p-8 shadow-xs print:border-0 print:shadow-none">
        {receipt.status === "REVERSED" ? (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-center text-[13px] font-semibold text-red-700">
            {r.reversed}
          </p>
        ) : null}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className="text-[15px] font-semibold">{receipt.organization_name}</p>
            <h1 className="mt-1 text-xl font-semibold">{r.title}</h1>
          </div>
          <dl className="text-right text-[13px]">
            <dt className="text-2xs text-muted">{r.no}</dt>
            <dd className="font-mono font-semibold">{receipt.receipt_no}</dd>
            <dt className="mt-1 text-2xs text-muted">{r.date}</dt>
            <dd>{formatDate(locale, receipt.paid_on)}</dd>
          </dl>
        </header>
        <dl className="divide-y divide-line text-[13px]">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[10rem_1fr] gap-3 py-2.5">
              <dt className="text-muted">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex items-baseline justify-between rounded-md bg-subtle px-4 py-3">
          <span className="text-[13px] text-muted">{r.amount}</span>
          <span className="text-2xl font-semibold num">{formatMoney(locale, receipt.amount)}</span>
        </div>
        <p className="mt-6 text-2xs text-muted">
          {r.verifiedAt} {formatDate(locale, receipt.verified_at)}
        </p>
      </article>
    </main>
  );
}
