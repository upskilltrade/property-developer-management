import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileCheck2, FilePen, FileText, Lock } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatDateTime, formatMoney, today } from "@/lib/format";
import { contractTone } from "@/lib/sales";
import { DetailList, Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { Field, Hidden, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ContractTermsForm } from "@/components/domain/contract-terms-form";
import { ContractSignForm } from "@/components/domain/contract-sign-form";
import { cancelContract, reviseContract, signContract } from "../../actions";

export const metadata: Metadata = { title: "Contract" };

/** One contract: every version side by side, signing with the signed PDF, cancellation. */
export default async function ContractDetail({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id } = await params;
  const { supabase } = await getSession(locale);
  const s = t.sales;
  const c = s.contract;
  const back = `/${locale}/app/sales/contracts/${id}`;

  const { data: k } = await supabase
    .from("sales_contracts")
    .select(
      "*,units(code),projects(code,name),customers(id,full_name,phone,email),bookings(booking_no,booking_date,list_price,agreed_price,lead_id),signer:profiles!sales_contracts_signed_by_fkey(display_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!k) notFound();
  const { data: versions } = await supabase
    .from("sales_contract_versions")
    .select("*,author:profiles!sales_contract_versions_created_by_fkey(display_name)")
    .eq("contract_id", id)
    .order("version", { ascending: false });
  const fileUrl = k.signed_file_path
    ? (await supabase.storage.from("contract-files").createSignedUrl(k.signed_file_path, 600)).data
        ?.signedUrl
    : null;

  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const customer = one(k.customers);
  const booking = one(k.bookings);
  const current = (versions ?? []).find((v) => v.version === k.current_version);
  const unitHref = `/${locale}/app/projects/${k.project_id}/units/${k.unit_id}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">
            {c.title} <span className="font-mono text-base">{k.contract_no}</span>
          </h2>
          <p className="text-2xs text-muted">
            {customer?.full_name} · {one(k.projects)?.code} · {one(k.units)?.code}
          </p>
        </div>
        <Badge tone={contractTone[k.status] ?? "neutral"}>
          {label(t.status.contract, k.status)}
        </Badge>
        {fileUrl ? (
          <a href={fileUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
            <FileText />
            {c.openFile}
          </a>
        ) : null}
        {k.status === "DRAFT" ? (
          <>
            <Sheet
              title={c.revise}
              description={c.reviseHint}
              triggerLabel={c.revise}
              triggerIcon={<FilePen />}
              triggerVariant="secondary"
              width="lg"
            >
              <ContractTermsForm
                t={t}
                action={reviseContract}
                hidden={{ locale, return_to: back, contract_id: k.id }}
                values={current}
                revise
                submitLabel={c.revise}
              />
            </Sheet>
            <Sheet
              title={c.sign}
              description={c.signHint}
              triggerLabel={c.sign}
              triggerIcon={<FileCheck2 />}
            >
              <ContractSignForm
                action={signContract}
                hidden={{ locale, return_to: back, contract_id: k.id }}
                folder={`${k.organization_id}/${k.project_id}/${k.unit_id}/${k.id}`}
                today={today()}
                labels={{
                  hint: c.signHint,
                  signedOn: c.signedOn,
                  file: c.signedFile,
                  submit: c.sign,
                  uploadFailed: c.uploadFailed,
                }}
              />
            </Sheet>
          </>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title={c.versions}>
            <ol className="divide-y divide-line">
              {(versions ?? []).map((v) => {
                const signed = k.signed_version === v.version;
                return (
                  <li key={v.id} className={cn("px-4 py-3", signed && "bg-emerald-50/60")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13px] font-semibold">
                        {c.version} {v.version}
                      </span>
                      {v.version === k.current_version ? (
                        <Badge tone="info">{c.currentVersion}</Badge>
                      ) : null}
                      {signed ? (
                        <Badge tone="success">
                          <Lock className="size-3" /> {c.locked}
                        </Badge>
                      ) : null}
                      <span className="ml-auto text-2xs text-muted">
                        {formatDateTime(locale, v.created_at)}
                        {one(v.author)?.display_name
                          ? ` · ${c.by} ${one(v.author)?.display_name}`
                          : ""}
                      </span>
                    </div>
                    {v.change_note ? (
                      <p className="mt-1 text-[13px] text-ink-2">{v.change_note}</p>
                    ) : null}
                    <dl className="mt-2 grid gap-x-4 gap-y-1 text-[12px] sm:grid-cols-3">
                      <div>
                        <dt className="text-muted">{c.price}</dt>
                        <dd className="font-medium num">{formatMoney(locale, v.contract_price)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">{c.downPayment}</dt>
                        <dd className="num">
                          {formatMoney(locale, v.down_payment)}
                          {v.installment_count ? ` · ${v.installment_count} ${c.installments}` : ""}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">{c.transferDue}</dt>
                        <dd>
                          {formatDate(locale, v.transfer_due)} · {label(c.languages, v.language)}
                        </dd>
                      </div>
                    </dl>
                    {v.terms ? (
                      <p className="mt-2 text-2xs whitespace-pre-line text-muted">{v.terms}</p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title={s.customer}>
            <DetailList
              items={[
                {
                  label: s.fields.name,
                  value: (
                    <Link
                      href={`/${locale}/app/sales/customers/${customer?.id}`}
                      className="text-brand hover:underline"
                    >
                      {customer?.full_name}
                    </Link>
                  ),
                },
                { label: s.fields.phone, value: customer?.phone ?? "—" },
                {
                  label: s.fields.unit,
                  value: (
                    <Link href={unitHref} className="text-brand hover:underline">
                      {one(k.units)?.code}
                    </Link>
                  ),
                },
                { label: s.bookingNo, value: booking?.booking_no ?? "—" },
                { label: s.listPrice, value: formatMoney(locale, booking?.list_price) },
                { label: s.agreedPrice, value: formatMoney(locale, booking?.agreed_price) },
                ...(k.status === "SIGNED"
                  ? [
                      { label: c.signedOn, value: formatDate(locale, k.signed_on) },
                      {
                        label: c.version,
                        value: `v${k.signed_version} · ${one(k.signer)?.display_name ?? "—"}`,
                      },
                    ]
                  : []),
                ...(k.cancel_reason ? [{ label: c.cancelReason, value: k.cancel_reason }] : []),
              ]}
            />
            <div className="border-t border-line px-4 py-3">
              <Link href={`${unitHref}/payments`} className={buttonClass("secondary", "xs")}>
                {c.payments}
              </Link>
            </div>
          </Panel>
          {k.status !== "CANCELLED" ? (
            <Panel title={c.cancel}>
              <form action={cancelContract} className="space-y-3 px-4 py-3">
                <Hidden values={{ locale, return_to: back, contract_id: k.id }} />
                <Field label={c.cancelReason} required>
                  <Input name="reason" required />
                </Field>
                <SubmitButton variant="danger">{c.cancel}</SubmitButton>
              </form>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
