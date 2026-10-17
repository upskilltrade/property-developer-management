import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarRange, Pencil, Wallet } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatMoney, formatNumber, toNumber } from "@/lib/format";
import { constructionStages, toneOf, unitStatuses } from "@/lib/status";
import { DetailList, Panel } from "@/components/ui/panel";
import { Kpi, KpiStrip } from "@/components/ui/kpi";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/components/ui/cn";
import { Unit360Panel, type Unit360Data } from "@/components/domain/unit-360";
import { timelineColumns, type TimelineEvent } from "@/lib/control";
import { linkCustomerAccount, saveConstruction, saveFinancials, saveSale } from "./actions";

type One<T> = T | T[] | null | undefined;
const one = <T,>(v: One<T>): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

export default async function Unit360({
  params,
}: {
  params: Promise<{ locale: string; id: string; unitId: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id, unitId } = await params;
  const { supabase, ownerOrganizationId } = await getSession(locale);

  const { data: u } = await supabase
    .from("units")
    .select(
      "id,code,name,status,list_price,target_completion_date,project_id,plots(code,land_area_sqm),house_types(code,name,bedrooms,bathrooms,gross_floor_area_sqm),unit_construction(*),unit_financials(*),unit_sales(*,customers(id,full_name,phone,email,primary_profile_id))",
    )
    .eq("id", unitId)
    .eq("project_id", id)
    .maybeSingle();
  if (!u) notFound();
  // With a schedule, construction progress is derived from verified activities, not typed in.
  const [
    { count: scheduleCount },
    { data: canFinance },
    { data: contract },
    { data: pays },
    { data: selections },
    { data: vos },
    { data: defects },
    { count: rfisOpen },
    { data: handover },
    { count: warranties },
    { count: serviceOpen },
    { data: events },
  ] = await Promise.all([
    supabase
      .from("schedule_activities")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unitId),
    supabase.rpc("can_view_finance", { target_project: id }),
    supabase
      .from("sales_contracts")
      .select("id,contract_no,status")
      .eq("unit_id", unitId)
      .neq("status", "CANCELLED")
      .maybeSingle(),
    supabase
      .from("payment_schedule_status")
      .select("amount,paid_amount,outstanding,payment_status")
      .eq("unit_id", unitId)
      .eq("status", "ACTIVE"),
    supabase.from("material_selections").select("status").eq("unit_id", unitId),
    supabase.from("variation_orders").select("status").eq("unit_id", unitId),
    supabase.from("defects").select("severity").eq("unit_id", unitId).neq("status", "VERIFIED"),
    supabase
      .from("rfis")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unitId)
      .neq("status", "CLOSED"),
    supabase.from("unit_handovers").select("status").eq("unit_id", unitId).maybeSingle(),
    supabase
      .from("unit_warranties")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unitId)
      .gte("end_date", new Date().toISOString().slice(0, 10)),
    supabase
      .from("service_requests")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unitId)
      .in("status", ["OPEN", "ASSIGNED", "RESOLVED"]),
    supabase
      .from("timeline_events")
      .select(timelineColumns)
      .eq("unit_id", unitId)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);
  // Unit cost figures are finance data; only finance / cost viewers see them.
  const showCost = canFinance === true;
  const sumOf = (rows: Record<string, unknown>[] | null, k: string) =>
    (rows ?? []).reduce((a, r) => a + toNumber(r[k]), 0);
  const view360: Unit360Data = {
    contract: contract
      ? { id: contract.id, no: contract.contract_no, status: contract.status }
      : null,
    scheduled: sumOf(pays, "amount"),
    collected: sumOf(pays, "paid_amount"),
    overdue: sumOf(
      (pays ?? []).filter((p) => p.payment_status === "OVERDUE"),
      "outstanding",
    ),
    selectionsPending: (selections ?? []).filter((x) => x.status === "PUBLISHED").length,
    selectionsApproved: (selections ?? []).filter((x) => x.status === "APPROVED").length,
    voOpen: (vos ?? []).filter(
      (v) => !["CLOSED", "CANCELLED", "CUSTOMER_REJECTED"].includes(v.status),
    ).length,
    voOffered: (vos ?? []).filter((v) => v.status === "OFFERED").length,
    voApproved: (vos ?? []).filter((v) =>
      ["CUSTOMER_APPROVED", "RELEASED", "CLOSED"].includes(v.status),
    ).length,
    defectsOpen: (defects ?? []).length,
    defectsHigh: (defects ?? []).filter((d) => d.severity === "HIGH").length,
    rfisOpen: rfisOpen ?? 0,
    handover: handover?.status ?? null,
    warranties: warranties ?? 0,
    serviceOpen: serviceOpen ?? 0,
    events: (events ?? []) as TimelineEvent[],
  };

  const plot = one(u.plots);
  const houseType = one(u.house_types);
  const con = one(u.unit_construction);
  const fin = one(u.unit_financials);
  const sale = one(u.unit_sales);
  const customer = one(sale?.customers);

  const budget = toNumber(fin?.budget_amount);
  const committed = toNumber(fin?.committed_amount);
  const actual = toNumber(fin?.actual_cost);
  const variance = budget ? budget - actual : null;
  const progress = toNumber(con?.progress_percent);
  const hidden = <Hidden values={{ locale, project_id: id, unit_id: unitId }} />;
  const editIcon = <Pencil />;
  const date = (v: string | null | undefined) => formatDate(locale, v);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/${locale}/app/projects/${id}`}
          className="grid size-8 place-items-center rounded-md border border-line bg-surface text-muted hover:text-ink"
          aria-label={t.common.back}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <p className="text-2xs font-medium tracking-wide text-muted uppercase">{t.unit.title}</p>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{u.code}</h2>
            {u.name ? <span className="text-[13px] text-muted">{u.name}</span> : null}
            <Badge tone={toneOf(u.status)}>{label(t.status.unit, u.status)}</Badge>
          </div>
        </div>
        <Link
          href={`/${locale}/app/projects/${id}/units/${unitId}/payments`}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium hover:bg-subtle"
        >
          <Wallet className="size-4" />
          {t.nav.payments}
        </Link>
        <Link
          href={`/${locale}/app/projects/${id}/units/${unitId}/schedule`}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium hover:bg-subtle"
        >
          <CalendarRange className="size-4" />
          {t.nav.schedule}
        </Link>
      </div>

      <KpiStrip cols={5}>
        <Kpi
          label={t.project.fields.listPrice}
          value={u.list_price != null ? formatMoney(locale, u.list_price) : "—"}
        />
        <Kpi
          label={t.unit.fields.agreedPrice}
          value={sale?.agreed_price != null ? formatMoney(locale, sale.agreed_price) : "—"}
          tone="brand"
        />
        <Kpi
          label={t.unit.fields.progress}
          value={`${Math.round(progress)}%`}
          sub={con?.stage ? label(t.status.stage, con.stage) : undefined}
        />
        {showCost ? (
          <Kpi
            label={t.unit.fields.actual}
            value={formatMoney(locale, actual)}
            sub={`${t.unit.fields.budget} ${formatMoney(locale, budget)}`}
          />
        ) : (
          <Kpi
            label={t.unit360.payments}
            value={formatMoney(locale, view360.collected)}
            sub={
              view360.scheduled
                ? `${t.unit360.collected} / ${formatMoney(locale, view360.scheduled)}`
                : undefined
            }
          />
        )}
        {showCost ? (
          <Kpi
            label={
              variance != null && variance < 0 ? t.unit.fields.overBudget : t.unit.fields.variance
            }
            value={variance != null ? formatMoney(locale, Math.abs(variance)) : "—"}
            tone={variance == null ? "default" : variance < 0 ? "negative" : "positive"}
          />
        ) : (
          <Kpi
            label={t.unit360.overdue}
            value={view360.overdue ? formatMoney(locale, view360.overdue) : "—"}
            tone={view360.overdue ? "negative" : "default"}
          />
        )}
      </KpiStrip>

      <section>
        <h3 className="mb-2 text-[13px] font-semibold">{t.unit360.title}</h3>
        <Unit360Panel
          t={t}
          locale={locale}
          projectId={id}
          unitId={unitId}
          unitCode={u.code}
          data={view360}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <Panel
          title={t.unit.sale}
          actions={
            <Sheet
              title={t.unit.editSale}
              triggerLabel={t.common.edit}
              triggerIcon={editIcon}
              triggerVariant="ghost"
              triggerSize="xs"
            >
              <form action={saveSale} className="space-y-3">
                {hidden}
                <Field label={t.common.status}>
                  <Select name="status" defaultValue={sale?.status ?? u.status ?? "AVAILABLE"}>
                    {unitStatuses.map((s) => (
                      <option key={s} value={s}>
                        {t.status.unit[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t.unit.fields.customerName}>
                  <Input name="customer_name" defaultValue={customer?.full_name ?? ""} />
                </Field>
                <FormGrid>
                  <Field label={t.unit.fields.phone}>
                    <Input name="phone" type="tel" defaultValue={customer?.phone ?? ""} />
                  </Field>
                  <Field label={t.unit.fields.email}>
                    <Input name="email" type="email" defaultValue={customer?.email ?? ""} />
                  </Field>
                </FormGrid>
                <Field label={`${t.unit.fields.agreedPrice} (THB)`}>
                  <Input
                    name="agreed_price"
                    type="number"
                    min="0"
                    step="1000"
                    defaultValue={sale?.agreed_price ?? ""}
                  />
                </Field>
                <FormGrid cols={3}>
                  <Field label={t.unit.fields.reservationDate}>
                    <Input
                      name="reservation_date"
                      type="date"
                      defaultValue={sale?.reservation_date ?? ""}
                    />
                  </Field>
                  <Field label={t.unit.fields.contractDate}>
                    <Input
                      name="contract_date"
                      type="date"
                      defaultValue={sale?.contract_date ?? ""}
                    />
                  </Field>
                  <Field label={t.unit.fields.transferDate}>
                    <Input
                      name="transfer_date"
                      type="date"
                      defaultValue={sale?.transfer_date ?? ""}
                    />
                  </Field>
                </FormGrid>
                <Field label={t.common.notes}>
                  <Textarea name="notes" defaultValue={sale?.notes ?? ""} />
                </Field>
                <SheetFooter>
                  <SubmitButton>{t.common.save}</SubmitButton>
                </SheetFooter>
              </form>
            </Sheet>
          }
        >
          <DetailList
            items={[
              {
                label: t.unit.customer,
                value: customer ? (
                  <div className="space-y-1">
                    <p>{customer.full_name}</p>
                    <p className="text-2xs font-normal text-muted">
                      {[customer.phone, customer.email].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={customer.primary_profile_id ? "success" : "neutral"}>
                        {customer.primary_profile_id
                          ? t.unit.accountLinked
                          : t.unit.accountNotLinked}
                      </Badge>
                      {ownerOrganizationId ? (
                        <Sheet
                          title={t.unit.linkAccount}
                          description={t.unit.linkHint}
                          triggerLabel={t.unit.linkAccount}
                          triggerVariant="ghost"
                          triggerSize="xs"
                        >
                          <form action={linkCustomerAccount} className="space-y-3">
                            {hidden}
                            <input type="hidden" name="customer_id" value={customer.id} />
                            <Field label={t.unit.accountEmail} required>
                              <Input
                                name="email"
                                type="email"
                                required
                                defaultValue={customer.email ?? ""}
                              />
                            </Field>
                            <SheetFooter>
                              <SubmitButton>{t.unit.linkAccount}</SubmitButton>
                            </SheetFooter>
                          </form>
                        </Sheet>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <span className="font-normal text-faint">{t.unit.noCustomer}</span>
                ),
              },
              {
                label: t.unit.fields.agreedPrice,
                value: sale?.agreed_price != null ? formatMoney(locale, sale.agreed_price) : "—",
              },
              { label: t.unit.fields.reservationDate, value: date(sale?.reservation_date) },
              { label: t.unit.fields.contractDate, value: date(sale?.contract_date) },
              { label: t.unit.fields.transferDate, value: date(sale?.transfer_date) },
              {
                label: t.common.notes,
                value: (
                  <span className="font-normal whitespace-pre-line">{sale?.notes || "—"}</span>
                ),
              },
            ]}
          />
        </Panel>

        <Panel
          title={t.unit.construction}
          actions={
            scheduleCount ? (
              <Link
                href={`/${locale}/app/projects/${id}/units/${unitId}/schedule`}
                className="text-2xs font-medium text-brand hover:underline"
              >
                {t.schedule.openSchedule} →
              </Link>
            ) : (
              <Sheet
                title={t.unit.editConstruction}
                triggerLabel={t.common.edit}
                triggerIcon={editIcon}
                triggerVariant="ghost"
                triggerSize="xs"
              >
                <form action={saveConstruction} className="space-y-3">
                  {hidden}
                  <FormGrid>
                    <Field label={t.unit.fields.stage}>
                      <Select name="stage" defaultValue={con?.stage ?? "NOT_STARTED"}>
                        {constructionStages.map((s) => (
                          <option key={s} value={s}>
                            {t.status.stage[s]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={t.unit.fields.progress}>
                      <Input
                        name="progress_percent"
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        defaultValue={progress}
                      />
                    </Field>
                  </FormGrid>
                  <FormGrid>
                    <Field label={t.unit.fields.startDate}>
                      <Input name="start_date" type="date" defaultValue={con?.start_date ?? ""} />
                    </Field>
                    <Field label={t.unit.fields.targetDate}>
                      <Input
                        name="target_completion_date"
                        type="date"
                        defaultValue={con?.target_completion_date ?? ""}
                      />
                    </Field>
                  </FormGrid>
                  <Field label={t.common.notes}>
                    <Textarea name="notes" defaultValue={con?.notes ?? ""} />
                  </Field>
                  <SheetFooter>
                    <SubmitButton>{t.common.save}</SubmitButton>
                  </SheetFooter>
                </form>
              </Sheet>
            )
          }
        >
          <div className="border-b border-line px-4 py-3">
            <Progress value={progress} />
            <ol className="mt-3 grid grid-cols-8 gap-0.5">
              {constructionStages.map((s, i) => {
                const reached = con?.stage
                  ? constructionStages.indexOf(con.stage as (typeof constructionStages)[number]) >=
                    i
                  : false;
                return (
                  <li
                    key={s}
                    title={t.status.stage[s]}
                    className={cn("h-1 rounded-full", reached ? "bg-brand" : "bg-slate-200")}
                  />
                );
              })}
            </ol>
          </div>
          <DetailList
            items={[
              {
                label: t.unit.fields.stage,
                value: con?.stage ? label(t.status.stage, con.stage) : "—",
              },
              { label: t.unit.fields.startDate, value: date(con?.start_date) },
              {
                label: t.unit.fields.targetDate,
                value: date(con?.target_completion_date ?? u.target_completion_date),
              },
              {
                label: t.common.notes,
                value: <span className="font-normal whitespace-pre-line">{con?.notes || "—"}</span>,
              },
            ]}
          />
        </Panel>

        {showCost ? (
          <Panel
            title={t.unit.cost}
            actions={
              <Sheet
                title={t.unit.editCost}
                triggerLabel={t.common.edit}
                triggerIcon={editIcon}
                triggerVariant="ghost"
                triggerSize="xs"
              >
                <form action={saveFinancials} className="space-y-3">
                  {hidden}
                  <Field label={`${t.unit.fields.budget} (THB)`}>
                    <Input
                      name="budget_amount"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={fin?.budget_amount ?? ""}
                    />
                  </Field>
                  <Field label={`${t.unit.fields.committed} (THB)`}>
                    <Input
                      name="committed_amount"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={fin?.committed_amount ?? ""}
                    />
                  </Field>
                  <Field label={`${t.unit.fields.actual} (THB)`}>
                    <Input
                      name="actual_cost"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={fin?.actual_cost ?? ""}
                    />
                  </Field>
                  <SheetFooter>
                    <SubmitButton>{t.common.save}</SubmitButton>
                  </SheetFooter>
                </form>
              </Sheet>
            }
          >
            <div className="space-y-2.5 border-b border-line px-4 py-3">
              {[
                { k: t.unit.fields.committed, v: committed, c: "bg-sky-500" },
                {
                  k: t.unit.fields.actual,
                  v: actual,
                  c: budget && actual > budget ? "bg-red-500" : "bg-brand",
                },
              ].map((row) => (
                <div key={row.k}>
                  <div className="mb-1 flex justify-between text-2xs">
                    <span className="text-muted">{row.k}</span>
                    <span className="font-medium num">
                      {budget ? `${Math.round((row.v / budget) * 100)}%` : "—"}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={cn("h-full rounded-full", row.c)}
                      style={{ width: `${budget ? Math.min(100, (row.v / budget) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <DetailList
              items={[
                { label: t.unit.fields.budget, value: formatMoney(locale, budget) },
                { label: t.unit.fields.committed, value: formatMoney(locale, committed) },
                { label: t.unit.fields.actual, value: formatMoney(locale, actual) },
                {
                  label: t.unit.fields.variance,
                  value:
                    variance != null ? (
                      <span className={cn(variance < 0 ? "text-red-700" : "text-emerald-700")}>
                        {formatMoney(locale, variance)}
                      </span>
                    ) : (
                      "—"
                    ),
                },
              ]}
            />
          </Panel>
        ) : null}

        <Panel title={t.unit.property}>
          <DetailList
            items={[
              { label: t.project.fields.plot, value: plot?.code ?? "—" },
              {
                label: t.project.fields.landArea,
                value:
                  plot?.land_area_sqm != null ? formatNumber(locale, plot.land_area_sqm, 2) : "—",
              },
              {
                label: t.project.fields.houseType,
                value: houseType ? `${houseType.code} · ${houseType.name}` : "—",
              },
              {
                label: t.project.fields.bedrooms,
                value: houseType ? formatNumber(locale, houseType.bedrooms) : "—",
              },
              {
                label: t.project.fields.bathrooms,
                value: houseType ? formatNumber(locale, houseType.bathrooms) : "—",
              },
              {
                label: t.project.fields.gfa,
                value:
                  houseType?.gross_floor_area_sqm != null
                    ? formatNumber(locale, houseType.gross_floor_area_sqm, 2)
                    : "—",
              },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}
