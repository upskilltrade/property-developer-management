import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Banknote, FileCheck2, Receipt, RotateCcw, Wallet, X } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import {
  defaultSchedule,
  evidenceStatusTone,
  paymentMethods,
  paymentStatusTone,
} from "@/lib/payments";
import { todayIso } from "@/lib/schedule";
import { Kpi, KpiStrip } from "@/components/ui/kpi";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { ScheduleBuilder } from "@/components/domain/schedule-builder";
import {
  recordPayment,
  rejectEvidence,
  reversePayment,
  setPaymentSchedule,
  verifyEvidence,
} from "./actions";

export const metadata: Metadata = { title: "Customer payments" };

type Installment = {
  id: string;
  sequence: number;
  kind: string;
  label_th: string;
  label_en: string;
  amount: number | string;
  due_date: string;
  paid_amount: number | string;
  outstanding: number | string;
  pending_evidence: number;
  payment_status: string;
};

export default async function UnitPayments({
  params,
}: {
  params: Promise<{ locale: string; id: string; unitId: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id, unitId } = await params;
  const { supabase, user } = await getSession(locale);
  const p = t.payments;

  const { data: unit } = await supabase
    .from("units")
    .select(
      "id,code,name,target_completion_date,unit_sales(agreed_price,customer_id,customers(full_name)),unit_construction(target_completion_date)",
    )
    .eq("id", unitId)
    .eq("project_id", id)
    .maybeSingle();
  if (!unit) notFound();
  const sale = Array.isArray(unit.unit_sales) ? unit.unit_sales[0] : unit.unit_sales;
  const customer = sale
    ? Array.isArray(sale.customers)
      ? sale.customers[0]
      : sale.customers
    : null;
  const construction = Array.isArray(unit.unit_construction)
    ? unit.unit_construction[0]
    : unit.unit_construction;

  const [
    { data: scheduleRows },
    { data: evidenceRows },
    { data: paymentRows },
    { data: canVerify },
    { data: canSchedule },
  ] = await Promise.all([
    supabase
      .from("payment_schedule_status")
      .select(
        "id,sequence,kind,label_th,label_en,amount,due_date,paid_amount,outstanding,pending_evidence,payment_status",
      )
      .eq("unit_id", unitId)
      .eq("status", "ACTIVE")
      .order("sequence"),
    supabase
      .from("payment_evidence")
      .select(
        "id,schedule_id,amount,paid_on,method,reference,note,file_path,submitted_by,submitted_by_customer,submitted_at,status,review_note,submitter:profiles!payment_evidence_submitted_by_fkey(display_name)",
      )
      .eq("unit_id", unitId)
      .order("submitted_at", { ascending: false })
      .limit(100),
    supabase
      .from("payments")
      .select(
        "id,schedule_id,amount,paid_on,method,reference,receipt_no,status,reversal_reason,verified_at",
      )
      .eq("unit_id", unitId)
      .order("paid_on", { ascending: false }),
    supabase.rpc("can_verify_payments", { target_project: id }),
    supabase.rpc("can_manage_payment_schedule", { target_project: id }),
  ]);

  const schedule = (scheduleRows ?? []) as Installment[];
  const evidence = evidenceRows ?? [];
  const payments = paymentRows ?? [];
  const pending = evidence.filter((e) => e.status === "SUBMITTED");
  const today = todayIso();
  const hidden = { locale, project_id: id, unit_id: unitId };
  const price = toNumber(sale?.agreed_price);
  const installmentName = new Map(
    schedule.map((s) => [s.id, `${s.sequence}. ${locale === "th" ? s.label_th : s.label_en}`]),
  );
  const money = (v: unknown) => formatMoney(locale, v);
  const date = (v: string | null | undefined) => formatDate(locale, v);

  const paths = evidence.map((e) => e.file_path).filter(Boolean) as string[];
  const { data: signed } = paths.length
    ? await supabase.storage.from("payment-evidence").createSignedUrls(paths, 3600)
    : { data: [] };
  const fileUrl = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));

  const scheduled = schedule.reduce((a, s) => a + toNumber(s.amount), 0);
  const paid = schedule.reduce((a, s) => a + toNumber(s.paid_amount), 0);
  const overdue = schedule
    .filter((s) => s.payment_status === "OVERDUE")
    .reduce((a, s) => a + toNumber(s.outstanding), 0);
  const locked = evidence.length > 0 || payments.length > 0;

  const builder = (
    <ScheduleBuilder
      action={setPaymentSchedule}
      hidden={hidden}
      price={price}
      locale={locale}
      initial={
        schedule.length
          ? schedule.map((s) => ({
              kind: s.kind as never,
              label_th: s.label_th,
              label_en: s.label_en,
              amount: toNumber(s.amount),
              due_date: s.due_date,
            }))
          : defaultSchedule({
              price,
              start: today,
              transfer:
                construction?.target_completion_date ?? unit.target_completion_date ?? today,
            })
      }
      labels={{
        hint: p.builderHint,
        kind: p.cols.kind,
        labelTh: `${p.cols.label} (TH)`,
        labelEn: `${p.cols.label} (EN)`,
        due: p.cols.due,
        amount: p.cols.amount,
        addRow: p.addRow,
        total: p.total,
        difference: p.difference,
        save: t.common.save,
        kinds: t.status.paymentKind,
      }}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/${locale}/app/projects/${id}/units/${unitId}`}
          className="grid size-8 place-items-center rounded-md border border-line bg-surface text-muted hover:text-ink"
          aria-label={t.common.back}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <p className="text-2xs font-medium tracking-wide text-muted uppercase">{p.title}</p>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{unit.code}</h2>
            {customer?.full_name ? (
              <span className="text-[13px] text-muted">{customer.full_name}</span>
            ) : null}
          </div>
        </div>
        {canSchedule && sale?.customer_id && !locked ? (
          <div className="ml-auto">
            <Sheet
              title={schedule.length ? p.replaceSchedule : p.buildSchedule}
              triggerLabel={schedule.length ? p.replaceSchedule : p.buildSchedule}
              triggerVariant={schedule.length ? "secondary" : "primary"}
              width="lg"
            >
              {builder}
            </Sheet>
          </div>
        ) : null}
      </div>

      <KpiStrip cols={5}>
        <Kpi label={p.price} value={price ? money(price) : "—"} />
        <Kpi
          label={p.kpi.scheduled}
          value={money(scheduled)}
          tone={price && scheduled !== price ? "negative" : "default"}
        />
        <Kpi label={p.kpi.paid} value={money(paid)} tone="positive" />
        <Kpi
          label={p.kpi.outstanding}
          value={money(scheduled - paid)}
          sub={overdue ? `${p.kpi.overdue} ${money(overdue)}` : undefined}
          tone={overdue ? "negative" : "default"}
        />
        <Kpi
          label={p.kpi.pending}
          value={pending.length}
          tone={pending.length ? "brand" : "default"}
        />
      </KpiStrip>

      <Panel title={p.schedule}>
        {schedule.length ? (
          <Table>
            <THead>
              <tr>
                <TH>{p.cols.seq}</TH>
                <TH>{p.cols.label}</TH>
                <TH>{p.cols.due}</TH>
                <TH align="right">{p.cols.amount}</TH>
                <TH align="right">{p.cols.paid}</TH>
                <TH align="right">{p.cols.outstanding}</TH>
                <TH>{t.common.status}</TH>
                <TH align="right">{t.common.actions}</TH>
              </tr>
            </THead>
            <tbody>
              {schedule.map((s) => (
                <TR key={s.id}>
                  <TD className="text-muted num">{s.sequence}</TD>
                  <TD>
                    <p className="font-medium">{locale === "th" ? s.label_th : s.label_en}</p>
                    <p className="text-2xs text-muted">{label(t.status.paymentKind, s.kind)}</p>
                  </TD>
                  <TD className={s.payment_status === "OVERDUE" ? "text-red-700" : "text-muted"}>
                    {date(s.due_date)}
                  </TD>
                  <TD align="right" className="font-semibold">
                    {money(s.amount)}
                  </TD>
                  <TD align="right" className="text-emerald-700">
                    {toNumber(s.paid_amount) ? money(s.paid_amount) : "—"}
                  </TD>
                  <TD align="right">{toNumber(s.outstanding) ? money(s.outstanding) : "—"}</TD>
                  <TD>
                    <Badge tone={paymentStatusTone[s.payment_status] ?? "neutral"}>
                      {label(t.status.payment, s.payment_status)}
                    </Badge>
                  </TD>
                  <TD align="right">
                    {canVerify && toNumber(s.outstanding) > 0 ? (
                      <Sheet
                        title={`${p.recordPayment} · ${s.sequence}`}
                        description={p.recordHint}
                        triggerLabel={p.recordPayment}
                        triggerIcon={<Banknote />}
                        triggerVariant="secondary"
                        triggerSize="xs"
                      >
                        <form action={recordPayment} className="space-y-3">
                          <Hidden values={{ ...hidden, schedule_id: s.id }} />
                          <FormGrid>
                            <Field label={p.fields.amount} required>
                              <Input
                                name="amount"
                                type="number"
                                min="0.01"
                                step="0.01"
                                defaultValue={toNumber(s.outstanding)}
                                required
                              />
                            </Field>
                            <Field label={p.fields.paidOn} required>
                              <Input
                                name="paid_on"
                                type="date"
                                defaultValue={today}
                                max={today}
                                required
                              />
                            </Field>
                          </FormGrid>
                          <FormGrid>
                            <Field label={p.fields.method}>
                              <Select name="method" defaultValue="CASH">
                                {paymentMethods.map((m) => (
                                  <option key={m} value={m}>
                                    {t.status.paymentMethod[m]}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                            <Field label={p.fields.reference}>
                              <Input name="reference" />
                            </Field>
                          </FormGrid>
                          <SheetFooter>
                            <SubmitButton>{p.recordPayment}</SubmitButton>
                          </SheetFooter>
                        </form>
                      </Sheet>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </tbody>
            <TFoot>
              <tr>
                <TD colSpan={3}>{p.total}</TD>
                <TD align="right">{money(scheduled)}</TD>
                <TD align="right">{money(paid)}</TD>
                <TD align="right">{money(scheduled - paid)}</TD>
                <TD colSpan={2} />
              </tr>
            </TFoot>
          </Table>
        ) : (
          <EmptyState
            icon={<Wallet />}
            title={p.noSchedule}
            body={sale?.customer_id ? undefined : p.noCustomer}
          />
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title={p.evidence}
          actions={
            pending.length ? (
              <Badge tone="info">{`${p.pendingEvidence} ${pending.length}`}</Badge>
            ) : null
          }
        >
          {evidence.length ? (
            <ul className="divide-y divide-line">
              {evidence.map((e) => {
                const submitter = Array.isArray(e.submitter) ? e.submitter[0] : e.submitter;
                const url = e.file_path ? fileUrl.get(e.file_path) : null;
                const isPdf = e.file_path?.endsWith(".pdf");
                return (
                  <li key={e.id} className="flex gap-3 px-4 py-3 text-[13px]">
                    {url && !isPdf ? (
                      <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
                        <img
                          src={url}
                          alt=""
                          className="size-16 rounded border border-line object-cover"
                        />
                      </a>
                    ) : (
                      <div className="grid size-16 shrink-0 place-items-center rounded border border-line bg-subtle text-faint">
                        <FileCheck2 className="size-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold num">{money(e.amount)}</span>
                        <Badge tone={evidenceStatusTone[e.status] ?? "neutral"}>
                          {label(t.status.evidence, e.status)}
                        </Badge>
                      </div>
                      <p className="truncate text-2xs text-muted">
                        {installmentName.get(e.schedule_id)} · {date(e.paid_on)} ·{" "}
                        {label(t.status.paymentMethod, e.method)}
                        {e.reference ? ` · ${e.reference}` : ""}
                      </p>
                      <p className="text-2xs text-muted">
                        {p.submittedBy}:{" "}
                        {e.submitted_by_customer
                          ? p.customer
                          : (submitter?.display_name ?? p.staff)}{" "}
                        · {date(e.submitted_at)}
                      </p>
                      {e.note ? <p className="text-2xs">{e.note}</p> : null}
                      {e.review_note ? (
                        <p className="text-2xs text-red-700">{e.review_note}</p>
                      ) : null}
                      {url && isPdf ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-2xs text-brand hover:underline"
                        >
                          {p.viewFile}
                        </a>
                      ) : null}
                    </div>
                    {e.status === "SUBMITTED" && canVerify ? (
                      <div className="flex shrink-0 flex-col gap-1">
                        {!e.submitted_by_customer && e.submitted_by === user.id ? null : (
                          <Sheet
                            title={p.verify}
                            description={p.verifyHint}
                            triggerLabel={p.verify}
                            triggerIcon={<FileCheck2 />}
                            triggerSize="xs"
                          >
                            <form action={verifyEvidence} className="space-y-3">
                              <Hidden values={{ ...hidden, evidence_id: e.id }} />
                              <FormGrid>
                                <Field label={p.fields.amount} required>
                                  <Input
                                    name="amount"
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    defaultValue={toNumber(e.amount)}
                                    required
                                  />
                                </Field>
                                <Field label={p.fields.paidOn}>
                                  <Input
                                    name="paid_on"
                                    type="date"
                                    defaultValue={e.paid_on}
                                    max={today}
                                  />
                                </Field>
                              </FormGrid>
                              <Field label={p.fields.note}>
                                <Textarea name="note" />
                              </Field>
                              <SheetFooter>
                                <SubmitButton variant="success">{p.verify}</SubmitButton>
                              </SheetFooter>
                            </form>
                          </Sheet>
                        )}
                        <Sheet
                          title={p.reject}
                          triggerLabel={p.reject}
                          triggerIcon={<X />}
                          triggerVariant="ghost"
                          triggerSize="xs"
                        >
                          <form action={rejectEvidence} className="space-y-3">
                            <Hidden values={{ ...hidden, evidence_id: e.id }} />
                            <Field label={p.rejectReason} required>
                              <Textarea name="note" required />
                            </Field>
                            <SheetFooter>
                              <SubmitButton variant="danger">{p.reject}</SubmitButton>
                            </SheetFooter>
                          </form>
                        </Sheet>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={<FileCheck2 />} title={p.noEvidence} />
          )}
        </Panel>

        <Panel title={p.payments}>
          {payments.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>{p.receiptNo}</TH>
                  <TH>{p.fields.paidOn}</TH>
                  <TH align="right">{p.cols.amount}</TH>
                  <TH>{t.common.status}</TH>
                  <TH align="right">{t.common.actions}</TH>
                </tr>
              </THead>
              <tbody>
                {payments.map((pm) => (
                  <TR key={pm.id}>
                    <TD>
                      <Link
                        href={`/${locale}/receipt/${pm.id}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 font-mono text-2xs font-medium text-brand hover:underline"
                      >
                        <Receipt className="size-3.5" />
                        {pm.receipt_no}
                      </Link>
                      <p className="truncate text-[10px] text-muted">
                        {installmentName.get(pm.schedule_id)} ·{" "}
                        {label(t.status.paymentMethod, pm.method)}
                      </p>
                    </TD>
                    <TD className="text-muted">{date(pm.paid_on)}</TD>
                    <TD
                      align="right"
                      className={
                        pm.status === "REVERSED" ? "text-faint line-through" : "font-semibold"
                      }
                    >
                      {money(pm.amount)}
                    </TD>
                    <TD>
                      {pm.status === "REVERSED" ? (
                        <Badge tone="danger">{p.reversed}</Badge>
                      ) : (
                        <Badge tone="success">{label(t.status.evidence, "VERIFIED")}</Badge>
                      )}
                      {pm.reversal_reason ? (
                        <p className="text-[10px] text-muted">{pm.reversal_reason}</p>
                      ) : null}
                    </TD>
                    <TD align="right">
                      {canVerify && pm.status === "VALID" ? (
                        <Sheet
                          title={`${p.reverse} · ${pm.receipt_no}`}
                          description={p.reverseHint}
                          triggerLabel={p.reverse}
                          triggerIcon={<RotateCcw />}
                          triggerVariant="ghost"
                          triggerSize="xs"
                        >
                          <form action={reversePayment} className="space-y-3">
                            <Hidden values={{ ...hidden, payment_id: pm.id }} />
                            <Field label={p.reverseReason} required>
                              <Textarea name="reason" required />
                            </Field>
                            <SheetFooter>
                              <SubmitButton variant="danger">{p.reverse}</SubmitButton>
                            </SheetFooter>
                          </form>
                        </Sheet>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={<Receipt />} title={p.noPayments} />
          )}
        </Panel>
      </div>
    </div>
  );
}
