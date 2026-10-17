import Link from "next/link";
import { Home } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import {
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  toNumber,
} from "@/lib/format";
import { soldStatuses, toneOf, unitStatuses } from "@/lib/status";
import { Kpi, KpiStrip } from "@/components/ui/kpi";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, FormGrid, Hidden, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/components/ui/cn";
import { countBy, InventoryBar, InventoryLegend } from "@/components/domain/inventory-bar";
import { addUnit } from "./actions";

type One<T> = T | T[] | null | undefined;
const one = <T,>(v: One<T>): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

export default async function ProjectOverview({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id } = await params;
  const { status = "" } = await searchParams;
  const { supabase } = await getSession(locale);
  const base = `/${locale}/app/projects/${id}`;

  const [{ data: project }, { data: unitRows }, { data: phases }, { data: plots }] =
    await Promise.all([
      supabase.from("projects").select("organization_id").eq("id", id).single(),
      supabase
        .from("units")
        .select(
          "id,code,name,status,list_price,phase_id,plots(code,land_area_sqm),house_types(code,name),unit_construction(stage,progress_percent),unit_sales(agreed_price,customers(full_name)),unit_financials(budget_amount,actual_cost)",
        )
        .eq("project_id", id)
        .order("code"),
      supabase.from("phases").select("id,code,name").eq("project_id", id).order("sequence_no"),
      supabase.from("plots").select("id,code").eq("project_id", id).order("code"),
    ]);
  const { data: houseTypes } = project
    ? await supabase
        .from("house_types")
        .select("id,code,name")
        .eq("organization_id", project.organization_id)
        .order("code")
    : { data: [] };

  const units = (unitRows ?? []).map((u) => {
    const con = one(u.unit_construction);
    const sale = one(u.unit_sales);
    const fin = one(u.unit_financials);
    return {
      ...u,
      plot: one(u.plots),
      houseType: one(u.house_types),
      stage: con?.stage ?? null,
      progress: toNumber(con?.progress_percent),
      agreedPrice: sale?.agreed_price ?? null,
      customer: one(sale?.customers)?.full_name ?? null,
      budget: toNumber(fin?.budget_amount),
      actual: toNumber(fin?.actual_cost),
    };
  });
  const counts = countBy(units, (u) => u.status);
  const rows = status ? units.filter((u) => u.status === status) : units;
  const listed = units.reduce((a, u) => a + toNumber(u.list_price), 0);
  const soldValue = units
    .filter((u) => soldStatuses.has(u.status))
    .reduce((a, u) => a + toNumber(u.agreedPrice ?? u.list_price), 0);
  const soldCount = units.filter((u) => soldStatuses.has(u.status)).length;
  const avgProgress = units.length ? units.reduce((a, u) => a + u.progress, 0) / units.length : 0;
  const budget = units.reduce((a, u) => a + u.budget, 0);
  const actual = units.reduce((a, u) => a + u.actual, 0);
  const phaseName = new Map((phases ?? []).map((p) => [p.id, p.code]));

  const addUnitSheet = (
    <Sheet title={t.project.newUnit} triggerLabel={t.project.newUnit}>
      <form action={addUnit} className="space-y-3">
        <Hidden values={{ locale, project_id: id }} />
        <FormGrid>
          <Field label={t.project.fields.unitCode} required>
            <Input name="code" required placeholder="A-01" className="uppercase" />
          </Field>
          <Field label={t.common.status}>
            <Select name="status" defaultValue="AVAILABLE">
              {unitStatuses.map((s) => (
                <option key={s} value={s}>
                  {t.status.unit[s]}
                </option>
              ))}
            </Select>
          </Field>
        </FormGrid>
        <Field label={t.project.fields.unitName}>
          <Input name="name" />
        </Field>
        <FormGrid>
          <Field label={t.project.fields.phase}>
            <Select name="phase_id" defaultValue="">
              <option value="">—</option>
              {(phases ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.project.fields.plot}>
            <Select name="plot_id" defaultValue="">
              <option value="">—</option>
              {(plots ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code}
                </option>
              ))}
            </Select>
          </Field>
        </FormGrid>
        <Field label={t.project.fields.houseType}>
          <Select name="house_type_id" defaultValue="">
            <option value="">—</option>
            {(houseTypes ?? []).map((h) => (
              <option key={h.id} value={h.id}>
                {h.code} · {h.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`${t.project.fields.listPrice} (THB)`}>
          <Input name="list_price" type="number" min="0" step="1000" inputMode="numeric" />
        </Field>
        <SheetFooter>
          <SubmitButton>{t.common.save}</SubmitButton>
        </SheetFooter>
      </form>
    </Sheet>
  );

  return (
    <div className="space-y-4">
      <KpiStrip>
        <Kpi
          label={t.projects.fields.units}
          value={formatNumber(locale, units.length)}
          sub={`${t.projects.fields.plots} ${formatNumber(locale, (plots ?? []).length)}`}
        />
        <Kpi
          label={t.dashboard.kpi.available}
          value={formatNumber(locale, counts.AVAILABLE ?? 0)}
          tone="positive"
        />
        <Kpi
          label={t.dashboard.kpi.sold}
          value={formatNumber(locale, soldCount)}
          sub={units.length ? formatPercent(locale, soldCount / units.length) : undefined}
          tone="brand"
        />
        <Kpi
          label={t.dashboard.kpi.listedValue}
          value={formatMoneyCompact(locale, listed)}
          sub={`${t.projects.fields.sold} ${formatMoneyCompact(locale, soldValue)}`}
        />
        <Kpi
          label={t.unit.construction}
          value={`${Math.round(avgProgress)}%`}
          sub={t.unit.fields.progress}
        />
        <Kpi
          label={t.unit.fields.actual}
          value={formatMoneyCompact(locale, actual)}
          sub={`${t.unit.fields.budget} ${formatMoneyCompact(locale, budget)}`}
          tone={budget && actual > budget ? "negative" : "default"}
        />
      </KpiStrip>

      <Panel bodyClassName="space-y-3 p-4">
        <InventoryBar counts={counts} labels={t.status.unit} className="h-3" />
        <InventoryLegend counts={counts} labels={t.status.unit} />
      </Panel>

      <Panel
        title={
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-2">{t.project.unitsTitle}</span>
            {["", ...unitStatuses.filter((s) => counts[s])].map((s) => (
              <Link
                key={s || "all"}
                href={s ? `${base}?status=${s}` : base}
                className={cn(
                  "rounded px-2 py-0.5 text-2xs font-medium",
                  status === s ? "bg-ink text-white" : "bg-slate-100 text-ink-2 hover:bg-slate-200",
                )}
              >
                {s ? label(t.status.unit, s) : t.common.all}{" "}
                <span className="opacity-60 num">{s ? counts[s] : units.length}</span>
              </Link>
            ))}
          </div>
        }
        actions={addUnitSheet}
      >
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <TH>{t.project.fields.unitCode}</TH>
                <TH>{t.project.fields.phase}</TH>
                <TH>{t.project.fields.plot}</TH>
                <TH>{t.project.fields.houseType}</TH>
                <TH>{t.common.status}</TH>
                <TH>{t.unit.customer}</TH>
                <TH align="right">{t.project.fields.listPrice}</TH>
                <TH align="right">{t.unit.fields.agreedPrice}</TH>
                <TH>{t.unit.fields.stage}</TH>
                <TH className="min-w-32">{t.unit.fields.progress}</TH>
                <TH align="right">{t.unit.fields.variance}</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((u) => {
                const variance = u.budget ? u.budget - u.actual : null;
                return (
                  <TR key={u.id}>
                    <TD>
                      <Link
                        href={`${base}/units/${u.id}`}
                        className="font-medium text-brand hover:underline"
                      >
                        {u.code}
                      </Link>
                      {u.name ? <span className="ml-1.5 text-2xs text-muted">{u.name}</span> : null}
                    </TD>
                    <TD className="text-muted">{u.phase_id ? phaseName.get(u.phase_id) : "—"}</TD>
                    <TD className="text-muted">
                      {u.plot?.code ?? "—"}
                      {u.plot?.land_area_sqm ? (
                        <span className="ml-1 text-2xs num">
                          ({formatNumber(locale, u.plot.land_area_sqm)} m²)
                        </span>
                      ) : null}
                    </TD>
                    <TD className="text-muted">{u.houseType?.code ?? "—"}</TD>
                    <TD>
                      <Badge tone={toneOf(u.status)}>{label(t.status.unit, u.status)}</Badge>
                    </TD>
                    <TD className="max-w-48 truncate">
                      {u.customer ?? <span className="text-faint">—</span>}
                    </TD>
                    <TD align="right">
                      {u.list_price != null ? formatMoney(locale, u.list_price) : "—"}
                    </TD>
                    <TD align="right">
                      {u.agreedPrice != null ? formatMoney(locale, u.agreedPrice) : "—"}
                    </TD>
                    <TD className="text-muted">{u.stage ? label(t.status.stage, u.stage) : "—"}</TD>
                    <TD>
                      <Progress value={u.progress} />
                    </TD>
                    <TD
                      align="right"
                      className={cn(variance != null && variance < 0 && "text-red-700")}
                    >
                      {variance != null ? formatMoney(locale, variance) : "—"}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
            <TFoot>
              <tr>
                <TD colSpan={6}>
                  {t.common.total} · {formatNumber(locale, rows.length)} {t.common.rows}
                </TD>
                <TD align="right">
                  {formatMoney(
                    locale,
                    rows.reduce((a, u) => a + toNumber(u.list_price), 0),
                  )}
                </TD>
                <TD align="right">
                  {formatMoney(
                    locale,
                    rows.reduce((a, u) => a + toNumber(u.agreedPrice), 0),
                  )}
                </TD>
                <TD colSpan={3} />
              </tr>
            </TFoot>
          </Table>
        ) : (
          <EmptyState
            icon={<Home />}
            title={t.project.noUnits}
            body={t.project.noUnitsBody}
            action={addUnitSheet}
          />
        )}
      </Panel>
    </div>
  );
}
