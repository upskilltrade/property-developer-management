import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { prTone } from "@/lib/procurement";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, Hidden, Input, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { addQuote, createPo, decideRequest } from "../../actions";
import { QuoteForm } from "@/components/domain/quote-form";
import { aiConfigured } from "@/lib/ai";

export const metadata: Metadata = { title: "Purchase request" };

/** Purchase request with its items and the quotation comparison (procurement staff only). */
export default async function RequestDetail({
  params,
}: {
  params: Promise<{ locale: string; id: string; prId: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id, prId } = await params;
  const { supabase } = await getSession(locale);
  const p = t.procurement;
  const base = `/${locale}/app/projects/${id}/procurement`;
  const back = `${base}/requests/${prId}`;

  const { data: pr } = await supabase
    .from("purchase_requests")
    .select(
      "*,cost_categories(code,name),units(code),requester:profiles!purchase_requests_requested_by_fkey(display_name)",
    )
    .eq("id", prId)
    .eq("project_id", id)
    .maybeSingle();
  if (!pr) notFound();
  const [{ data: items }, { data: quotes }, { data: suppliers }] = await Promise.all([
    supabase.from("pr_items").select("id,description,quantity,uom,est_rate").eq("pr_id", prId),
    supabase
      .from("supplier_quotations")
      .select(
        "id,partner_id,quote_ref,amount,lead_time_days,valid_until,notes,status,partner_organizations(name)",
      )
      .eq("pr_id", prId)
      .order("amount"),
    supabase
      .from("partner_organizations")
      .select("id,name,partner_type")
      .eq("status", "ACTIVE")
      .order("name"),
  ]);
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const cat = one(pr.cost_categories);
  const lowest = quotes?.length ? Math.min(...quotes.map((q) => toNumber(q.amount))) : null;
  const ctx = { locale, return_to: back, pr_id: pr.id, project_id: id };
  const quoted = new Set((quotes ?? []).map((q) => q.partner_id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`${base}?view=requests`} className={buttonClass("ghost", "sm", "-ml-2 px-2")}>
          <ArrowLeft />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">
            <span className="font-mono">{pr.pr_no}</span> · {pr.title}
          </h2>
          <p className="text-2xs text-muted">
            {cat?.code} · {cat?.name}
            {one(pr.units)?.code ? ` · ${one(pr.units)?.code}` : ""} ·{" "}
            {one(pr.requester)?.display_name ?? "—"} · {p.neededBy}{" "}
            {formatDate(locale, pr.needed_by)}
          </p>
        </div>
        <Badge tone={prTone[pr.status] ?? "neutral"}>{label(t.status.pr, pr.status)}</Badge>
        {pr.status === "SUBMITTED" ? (
          <form action={decideRequest} className="flex items-center gap-1">
            <Hidden values={ctx} />
            <Input name="note" placeholder={p.reason} className="h-8 w-40" />
            <SubmitButton variant="success" name="decision" value="approve">
              {p.approve}
            </SubmitButton>
            <SubmitButton variant="danger" name="decision" value="reject">
              {p.reject}
            </SubmitButton>
          </form>
        ) : null}
      </div>

      <Panel title={`${p.items} · ${p.estimated} ${formatMoney(locale, pr.estimated_amount)}`}>
        <Table>
          <THead>
            <tr>
              <TH>{p.description}</TH>
              <TH align="right">{p.quantity}</TH>
              <TH>{p.uom}</TH>
              <TH align="right">{p.rate}</TH>
              <TH align="right">{p.amount}</TH>
            </tr>
          </THead>
          <tbody>
            {(items ?? []).map((i) => (
              <TR key={i.id}>
                <TD>{i.description}</TD>
                <TD align="right" className="num">
                  {toNumber(i.quantity).toLocaleString()}
                </TD>
                <TD className="text-muted">{i.uom}</TD>
                <TD align="right">{formatMoney(locale, i.est_rate)}</TD>
                <TD align="right">
                  {formatMoney(locale, toNumber(i.quantity) * toNumber(i.est_rate))}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Panel>

      <Panel
        title={p.quotations}
        actions={
          pr.status === "APPROVED" ? (
            <Sheet title={p.addQuote} triggerLabel={p.addQuote} triggerSize="xs">
              <QuoteForm
                action={addQuote}
                hidden={ctx}
                extractUrl={`/${locale}/app/projects/${id}/procurement/extract`}
                aiEnabled={aiConfigured()}
                suppliers={(suppliers ?? [])
                  .filter((s) => !quoted.has(s.id))
                  .map((s) => ({
                    id: s.id,
                    name: s.name,
                    label: `${s.name} (${label(t.status.partnerType, s.partner_type)})`,
                  }))}
                labels={{
                  supplier: p.supplier,
                  quoteRef: p.quoteRef,
                  amount: p.amount,
                  leadTime: p.leadTime,
                  validUntil: p.validUntil,
                  note: p.note,
                  submit: p.addQuote,
                  ai: t.aiQuote,
                  errors: t.assistant.errors,
                }}
              />
            </Sheet>
          ) : null
        }
      >
        {quotes?.length ? (
          <Table>
            <THead>
              <tr>
                <TH>{p.supplier}</TH>
                <TH>{p.quoteRef}</TH>
                <TH align="right">{p.amount}</TH>
                <TH align="right">{p.leadTime}</TH>
                <TH>{p.validUntil}</TH>
                <TH>{t.common.status}</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {quotes.map((q) => {
                const isLow = toNumber(q.amount) === lowest;
                return (
                  <TR key={q.id}>
                    <TD className="font-medium">
                      {one(q.partner_organizations)?.name}
                      {q.notes ? (
                        <p className="text-[10px] font-normal text-muted">{q.notes}</p>
                      ) : null}
                    </TD>
                    <TD className="text-muted">{q.quote_ref ?? "—"}</TD>
                    <TD align="right" className={cn(isLow && "font-semibold text-emerald-700")}>
                      {formatMoney(locale, q.amount)}
                      {isLow ? <p className="text-[10px]">{p.lowest}</p> : null}
                    </TD>
                    <TD align="right" className="num">
                      {q.lead_time_days ?? "—"}
                    </TD>
                    <TD className="text-muted">{formatDate(locale, q.valid_until)}</TD>
                    <TD>
                      <Badge tone={q.status === "SELECTED" ? "success" : "neutral"}>
                        {label(t.status.quote, q.status)}
                      </Badge>
                    </TD>
                    <TD>
                      {pr.status === "APPROVED" ? (
                        <Sheet
                          title={`${p.createPo} · ${one(q.partner_organizations)?.name}`}
                          triggerLabel={p.createPo}
                          triggerIcon={<FileText />}
                          triggerSize="xs"
                        >
                          <form action={createPo} className="space-y-3">
                            <Hidden values={{ ...ctx, quotation_id: q.id }} />
                            <p className="text-[13px]">
                              {p.amount}: <b className="num">{formatMoney(locale, q.amount)}</b>
                            </p>
                            <Field label={p.deliveryDue}>
                              <Input name="delivery_due" type="date" />
                            </Field>
                            <Field label={p.terms}>
                              <Textarea name="terms" />
                            </Field>
                            <SheetFooter>
                              <SubmitButton>{p.createPo}</SubmitButton>
                            </SheetFooter>
                          </form>
                        </Sheet>
                      ) : null}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <p className="px-4 py-6 text-center text-2xs text-faint">{p.noQuotes}</p>
        )}
      </Panel>
    </div>
  );
}
