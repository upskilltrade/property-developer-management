import type { Metadata } from "next";
import Link from "next/link";
import { FileSignature, Receipt } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatMoney } from "@/lib/format";
import { bookingTone } from "@/lib/sales";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Hidden, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Sheet } from "@/components/ui/sheet";
import { ContractTermsForm } from "@/components/domain/contract-terms-form";
import { createContract, decideBooking } from "../actions";

export const metadata: Metadata = { title: "Bookings" };

/** Bookings with discount against list price; pending discounts are approved or rejected here. */
export default async function Bookings({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ project?: string; status?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const q = await searchParams;
  const { supabase, user } = await getSession(locale);
  const s = t.sales;
  const back = `/${locale}/app/sales/bookings${q.project ? `?project=${q.project}` : ""}`;

  let query = supabase
    .from("bookings")
    .select(
      "id,booking_no,booking_date,project_id,unit_id,lead_id,list_price,agreed_price,booking_amount,discount_reason,status,requested_by,cancel_reason,units(code),projects(code),customers(full_name,phone),requester:profiles!bookings_requested_by_fkey(display_name),sales_contracts(id,contract_no,status)",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (q.project) query = query.eq("project_id", q.project);
  if (q.status) query = query.eq("status", q.status);
  const { data: bookings } = await query;
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const pending = (bookings ?? []).filter((b) => b.status === "PENDING_APPROVAL").length;

  return (
    <Panel
      title={s.tabs.bookings}
      description={pending ? `${s.pendingApproval}: ${pending}` : undefined}
      actions={
        <form className="flex items-center gap-2">
          {q.project ? <input type="hidden" name="project" value={q.project} /> : null}
          <Select name="status" defaultValue={q.status ?? ""} className="w-40">
            <option value="">
              {t.common.status}: {t.common.all}
            </option>
            {Object.entries(t.status.booking).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <button
            type="submit"
            className="h-8 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium hover:bg-subtle"
          >
            {t.common.filter}
          </button>
        </form>
      }
    >
      {bookings?.length ? (
        <Table>
          <THead>
            <tr>
              <TH>{s.bookingNo}</TH>
              <TH>{s.customer}</TH>
              <TH>{s.fields.unit}</TH>
              <TH align="right">{s.listPrice}</TH>
              <TH align="right">{s.agreedPrice}</TH>
              <TH align="right">{s.discount}</TH>
              <TH align="right">{s.bookingAmount}</TH>
              <TH>{t.common.status}</TH>
              <TH>{t.common.actions}</TH>
            </tr>
          </THead>
          <tbody>
            {bookings.map((b) => {
              const discount = Math.max(0, Number(b.list_price ?? 0) - Number(b.agreed_price));
              const customer = one(b.customers);
              const live = (b.sales_contracts ?? []).find((k) => k.status !== "CANCELLED");
              return (
                <TR key={b.id}>
                  <TD>
                    <span className="font-mono text-[12px]">{b.booking_no}</span>
                    <p className="text-[10px] text-muted">{formatDate(locale, b.booking_date)}</p>
                  </TD>
                  <TD>
                    {b.lead_id ? (
                      <Link
                        href={`/${locale}/app/sales/leads/${b.lead_id}`}
                        className="font-medium hover:text-brand hover:underline"
                      >
                        {customer?.full_name}
                      </Link>
                    ) : (
                      customer?.full_name
                    )}
                    {customer?.phone ? (
                      <p className="text-[10px] text-muted">{customer.phone}</p>
                    ) : null}
                  </TD>
                  <TD>
                    <Link
                      href={`/${locale}/app/projects/${b.project_id}/units/${b.unit_id}`}
                      className="hover:text-brand hover:underline"
                    >
                      {one(b.projects)?.code} · {one(b.units)?.code}
                    </Link>
                  </TD>
                  <TD align="right">{formatMoney(locale, b.list_price)}</TD>
                  <TD align="right">{formatMoney(locale, b.agreed_price)}</TD>
                  <TD align="right" className={discount ? "text-amber-700" : "text-muted"}>
                    {discount ? formatMoney(locale, discount) : "—"}
                    {b.discount_reason ? (
                      <p className="text-[10px] text-muted">{b.discount_reason}</p>
                    ) : null}
                  </TD>
                  <TD align="right">{formatMoney(locale, b.booking_amount)}</TD>
                  <TD>
                    <Badge tone={bookingTone[b.status] ?? "neutral"}>
                      {label(t.status.booking, b.status)}
                    </Badge>
                    {b.status === "CANCELLED" && b.cancel_reason ? (
                      <p
                        className="mt-0.5 max-w-40 truncate text-[10px] text-muted"
                        title={b.cancel_reason}
                      >
                        {b.cancel_reason}
                      </p>
                    ) : null}
                  </TD>
                  <TD>
                    {b.status === "PENDING_APPROVAL" ? (
                      b.requested_by === user.id ? (
                        <span className="text-2xs text-muted">
                          {s.bookedBy} {one(b.requester)?.display_name ?? "—"}
                        </span>
                      ) : (
                        <form action={decideBooking} className="flex items-center gap-1">
                          <Hidden values={{ locale, return_to: back, booking_id: b.id }} />
                          <Input
                            name="note"
                            placeholder={s.rejectReason}
                            className="h-6 w-28 text-2xs"
                          />
                          <SubmitButton size="xs" variant="success" name="decision" value="approve">
                            {s.approve}
                          </SubmitButton>
                          <SubmitButton size="xs" variant="danger" name="decision" value="reject">
                            {s.reject}
                          </SubmitButton>
                        </form>
                      )
                    ) : null}
                    {b.status === "CONFIRMED" ? (
                      live ? (
                        <Link
                          href={`/${locale}/app/sales/contracts/${live.id}`}
                          className="font-mono text-[12px] text-brand hover:underline"
                        >
                          {live.contract_no} · {label(t.status.contract, live.status)}
                        </Link>
                      ) : (
                        <Sheet
                          title={s.contract.create}
                          description={s.contract.createHint}
                          triggerLabel={s.contract.create}
                          triggerIcon={<FileSignature />}
                          triggerVariant="secondary"
                          triggerSize="xs"
                          width="lg"
                        >
                          <ContractTermsForm
                            t={t}
                            action={createContract}
                            hidden={{ locale, return_to: back, booking_id: b.id }}
                            values={{ contract_price: b.agreed_price }}
                            submitLabel={s.contract.create}
                          />
                        </Sheet>
                      )
                    ) : null}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<Receipt />} title={q.status ? t.common.noResults : s.noBookings} />
      )}
    </Panel>
  );
}
