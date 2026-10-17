import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { History, Home, Pencil } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatDateTime, formatMoney, toNumber } from "@/lib/format";
import { bookingTone, contractTone, stageTone } from "@/lib/sales";
import { toneOf } from "@/lib/status";
import { DetailList, Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, FormGrid, Hidden, Input, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { updateCustomer } from "../../actions";

export const metadata: Metadata = { title: "Customer 360°" };

/** Customer 360°: contact, units with payment position, leads (source), bookings, contracts, timeline. */
export default async function Customer360({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id } = await params;
  const { supabase } = await getSession(locale);
  const s = t.sales;
  const c = s.customer360;
  const back = `/${locale}/app/sales/customers/${id}`;

  const { data: cu } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (!cu) notFound();

  const [{ data: sales }, { data: leads }, { data: bookings }, { data: contracts }] =
    await Promise.all([
      supabase
        .from("unit_sales")
        .select(
          "unit_id,status,agreed_price,reservation_date,contract_date,transfer_date,units(code,project_id,projects(code,name))",
        )
        .eq("customer_id", id),
      supabase
        .from("leads")
        .select("id,lead_no,source,campaign,stage,created_at")
        .eq("customer_id", id),
      supabase
        .from("bookings")
        .select("id,booking_no,booking_date,status,agreed_price,lead_id,units(code)")
        .eq("customer_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("sales_contracts")
        .select("id,contract_no,status,current_version,signed_on,units(code)")
        .eq("customer_id", id)
        .order("created_at", { ascending: false }),
    ]);
  const unitIds = (sales ?? []).map((x) => x.unit_id);
  const [{ data: schedules }, { data: timeline }] = unitIds.length
    ? await Promise.all([
        supabase
          .from("payment_schedule_status")
          .select("unit_id,amount,paid_amount,outstanding")
          .in("unit_id", unitIds),
        supabase
          .from("timeline_events")
          .select("id,event_type,title,created_at,unit_id")
          .in("unit_id", unitIds)
          .order("created_at", { ascending: false })
          .limit(50),
      ])
    : [{ data: [] }, { data: [] }];

  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const money = (unit: string, key: "paid_amount" | "outstanding") =>
    (schedules ?? [])
      .filter((x) => x.unit_id === unit)
      .reduce((sum, x) => sum + toNumber(x[key]), 0);
  const unitCode = new Map((sales ?? []).map((x) => [x.unit_id, one(x.units)?.code]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{cu.full_name}</h2>
          <p className="text-2xs text-muted">{c.title}</p>
        </div>
        <Badge tone={cu.primary_profile_id ? "success" : "neutral"}>
          {c.portal}: {cu.primary_profile_id ? c.portalLinked : c.portalNotLinked}
        </Badge>
        <Sheet
          title={c.edit}
          triggerLabel={c.edit}
          triggerIcon={<Pencil />}
          triggerVariant="secondary"
        >
          <form action={updateCustomer} className="space-y-3">
            <Hidden values={{ locale, return_to: back, customer_id: cu.id }} />
            <Field label={s.fields.name} required>
              <Input name="full_name" required defaultValue={cu.full_name} />
            </Field>
            <FormGrid>
              <Field label={s.fields.phone}>
                <Input name="phone" type="tel" defaultValue={cu.phone ?? ""} />
              </Field>
              <Field label={s.fields.email}>
                <Input name="email" type="email" defaultValue={cu.email ?? ""} />
              </Field>
            </FormGrid>
            <Field label={c.nationality}>
              <Input name="nationality" defaultValue={cu.nationality ?? ""} />
            </Field>
            <Field label={s.fields.notes}>
              <Textarea name="notes" defaultValue={cu.notes ?? ""} />
            </Field>
            <SheetFooter>
              <SubmitButton>{t.common.save}</SubmitButton>
            </SheetFooter>
          </form>
        </Sheet>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title={c.units}>
            {sales?.length ? (
              <Table>
                <THead>
                  <tr>
                    <TH>{s.fields.unit}</TH>
                    <TH>{t.common.status}</TH>
                    <TH align="right">{s.agreedPrice}</TH>
                    <TH align="right">{c.paid}</TH>
                    <TH align="right">{c.outstanding}</TH>
                    <TH>{s.contract.transferDue}</TH>
                  </tr>
                </THead>
                <tbody>
                  {sales.map((x) => {
                    const u = one(x.units);
                    return (
                      <TR key={x.unit_id}>
                        <TD>
                          <Link
                            href={`/${locale}/app/projects/${u?.project_id}/units/${x.unit_id}`}
                            className="font-medium hover:text-brand hover:underline"
                          >
                            {one(u?.projects ?? null)?.code} · {u?.code}
                          </Link>
                        </TD>
                        <TD>
                          <Badge tone={toneOf(x.status)}>{label(t.status.unit, x.status)}</Badge>
                        </TD>
                        <TD align="right">{formatMoney(locale, x.agreed_price)}</TD>
                        <TD align="right" className="text-emerald-700">
                          {formatMoney(locale, money(x.unit_id, "paid_amount"))}
                        </TD>
                        <TD align="right">
                          <Link
                            href={`/${locale}/app/projects/${u?.project_id}/units/${x.unit_id}/payments`}
                            className="hover:text-brand hover:underline"
                          >
                            {formatMoney(locale, money(x.unit_id, "outstanding"))}
                          </Link>
                        </TD>
                        <TD className="text-muted">{formatDate(locale, x.transfer_date)}</TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            ) : (
              <EmptyState icon={<Home />} title="—" />
            )}
          </Panel>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title={s.tabs.bookings}>
              <ul className="divide-y divide-line">
                {(bookings ?? []).map((b) => (
                  <li key={b.id} className="flex items-center gap-2 px-4 py-2.5 text-[13px]">
                    <span className="font-mono text-[12px]">{b.booking_no}</span>
                    <span className="text-muted">{one(b.units)?.code}</span>
                    <span className="ml-auto num">{formatMoney(locale, b.agreed_price)}</span>
                    <Badge tone={bookingTone[b.status] ?? "neutral"}>
                      {label(t.status.booking, b.status)}
                    </Badge>
                  </li>
                ))}
                {!bookings?.length ? (
                  <li className="px-4 py-4 text-center text-2xs text-faint">{s.noBookings}</li>
                ) : null}
              </ul>
            </Panel>
            <Panel title={s.tabs.contracts}>
              <ul className="divide-y divide-line">
                {(contracts ?? []).map((k) => (
                  <li key={k.id} className="flex items-center gap-2 px-4 py-2.5 text-[13px]">
                    <Link
                      href={`/${locale}/app/sales/contracts/${k.id}`}
                      className="font-mono text-[12px] hover:text-brand hover:underline"
                    >
                      {k.contract_no}
                    </Link>
                    <span className="text-muted">
                      {one(k.units)?.code} · v{k.current_version}
                    </span>
                    <Badge tone={contractTone[k.status] ?? "neutral"} className="ml-auto">
                      {label(t.status.contract, k.status)}
                    </Badge>
                  </li>
                ))}
                {!contracts?.length ? (
                  <li className="px-4 py-4 text-center text-2xs text-faint">
                    {s.contract.noContracts}
                  </li>
                ) : null}
              </ul>
            </Panel>
          </div>

          <Panel title={s.timeline}>
            {timeline?.length ? (
              <ol className="divide-y divide-line">
                {timeline.map((e) => (
                  <li key={e.id} className="flex gap-3 px-4 py-2 text-[13px]">
                    <History className="mt-0.5 size-3.5 shrink-0 text-faint" />
                    <div className="min-w-0 flex-1">
                      <p>
                        <span className="font-medium">
                          {label(t.status.timelineEvent, e.event_type)}
                        </span>
                        <span className="text-ink-2"> — {e.title}</span>
                      </p>
                      <p className="text-2xs text-muted">
                        {formatDateTime(locale, e.created_at)} · {unitCode.get(e.unit_id) ?? ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState icon={<History />} title="—" />
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title={c.title}>
            <DetailList
              items={[
                { label: s.fields.phone, value: cu.phone ?? "—" },
                { label: s.fields.email, value: cu.email ?? "—" },
                { label: c.nationality, value: cu.nationality ?? "—" },
                { label: t.common.date, value: formatDate(locale, cu.created_at) },
                ...(cu.notes ? [{ label: s.fields.notes, value: cu.notes }] : []),
              ]}
            />
          </Panel>
          <Panel title={c.leadSource}>
            <ul className="divide-y divide-line">
              {(leads ?? []).map((l) => (
                <li key={l.id} className="px-4 py-2.5 text-[13px]">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/${locale}/app/sales/leads/${l.id}`}
                      className="font-mono text-[12px] hover:text-brand hover:underline"
                    >
                      {l.lead_no}
                    </Link>
                    <Badge tone={stageTone[l.stage] ?? "neutral"} className="ml-auto">
                      {label(t.status.leadStage, l.stage)}
                    </Badge>
                  </div>
                  <p className="text-2xs text-muted">
                    {label(t.status.leadSource, l.source)}
                    {l.campaign ? ` · ${l.campaign}` : ""} · {formatDate(locale, l.created_at)}
                  </p>
                </li>
              ))}
              {!leads?.length ? (
                <li className="px-4 py-4 text-center text-2xs text-faint">—</li>
              ) : null}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
