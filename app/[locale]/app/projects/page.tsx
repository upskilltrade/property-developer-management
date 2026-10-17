import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Search } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatMoney, formatNumber, toNumber } from "@/lib/format";
import { projectStatuses, soldStatuses, toneOf } from "@/lib/status";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet } from "@/components/ui/sheet";
import { Input, Select } from "@/components/ui/field";
import { Button, ButtonLink } from "@/components/ui/button";
import { countBy, InventoryBar } from "@/components/domain/inventory-bar";
import { ProjectForm } from "@/components/domain/project-form";
import { createProject } from "./actions";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { supabase } = await getSession(locale);
  const { q = "", status = "" } = await searchParams;
  const base = `/${locale}/app/projects`;

  const { data } = await supabase
    .from("projects")
    .select(
      "id,code,name,status,currency_code,target_completion_date,plots(id),units(id,status,list_price)",
    )
    .order("code");

  const all = (data ?? []).map((p) => {
    const units = p.units ?? [];
    return {
      ...p,
      plotCount: (p.plots ?? []).length,
      unitCount: units.length,
      available: units.filter((u) => u.status === "AVAILABLE").length,
      sold: units.filter((u) => soldStatuses.has(u.status)).length,
      value: units.reduce((a, u) => a + toNumber(u.list_price), 0),
      counts: countBy(units, (u) => u.status),
    };
  });
  const needle = q.trim().toLowerCase();
  const rows = all.filter(
    (p) =>
      (!status || p.status === status) &&
      (!needle || `${p.code} ${p.name}`.toLowerCase().includes(needle)),
  );
  const total = (k: "plotCount" | "unitCount" | "available" | "sold" | "value") =>
    rows.reduce((a, r) => a + r[k], 0);

  const newProject = (
    <Sheet title={t.projects.new} triggerLabel={t.projects.new}>
      <ProjectForm t={t} locale={locale} action={createProject} />
    </Sheet>
  );

  return (
    <>
      <PageHeader
        title={t.projects.title}
        subtitle={t.projects.subtitle}
        crumbs={[{ label: t.nav.dashboard, href: `/${locale}/app` }, { label: t.projects.title }]}
        actions={newProject}
      />

      <Panel
        title={
          <form className="flex flex-wrap items-center gap-2" role="search">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
              <Input
                name="q"
                defaultValue={q}
                placeholder={t.projects.searchPlaceholder}
                className="w-64 pl-8 font-normal"
              />
            </div>
            <Select name="status" defaultValue={status} className="w-40 font-normal">
              <option value="">{t.common.all}</option>
              {projectStatuses.map((s) => (
                <option key={s} value={s}>
                  {t.status.project[s]}
                </option>
              ))}
            </Select>
            <Button type="submit" size="sm">
              {t.common.filter}
            </Button>
            {q || status ? (
              <ButtonLink href={base} variant="ghost" size="sm">
                {t.common.clear}
              </ButtonLink>
            ) : null}
          </form>
        }
        actions={
          <span className="text-2xs text-muted num">
            {rows.length} / {all.length} {t.common.rows}
          </span>
        }
      >
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <TH>{t.common.code}</TH>
                <TH>{t.projects.fields.name}</TH>
                <TH>{t.common.status}</TH>
                <TH align="right">{t.projects.fields.plots}</TH>
                <TH align="right">{t.projects.fields.units}</TH>
                <TH align="right">{t.projects.fields.available}</TH>
                <TH align="right">{t.projects.fields.sold}</TH>
                <TH className="min-w-36" />
                <TH align="right">{t.projects.fields.value}</TH>
                <TH align="right">{t.projects.fields.target}</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((p) => (
                <TR key={p.id}>
                  <TD className="font-mono text-2xs text-muted">{p.code}</TD>
                  <TD>
                    <Link
                      href={`${base}/${p.id}`}
                      className="font-medium hover:text-brand hover:underline"
                    >
                      {p.name}
                    </Link>
                  </TD>
                  <TD>
                    <Badge tone={toneOf(p.status)}>{label(t.status.project, p.status)}</Badge>
                  </TD>
                  <TD align="right">{formatNumber(locale, p.plotCount)}</TD>
                  <TD align="right">{formatNumber(locale, p.unitCount)}</TD>
                  <TD align="right" className="text-emerald-700">
                    {formatNumber(locale, p.available)}
                  </TD>
                  <TD align="right" className="text-brand">
                    {formatNumber(locale, p.sold)}
                  </TD>
                  <TD>
                    <InventoryBar counts={p.counts} labels={t.status.unit} />
                  </TD>
                  <TD align="right">{formatMoney(locale, p.value, p.currency_code ?? "THB")}</TD>
                  <TD align="right" className="text-muted">
                    {formatDate(locale, p.target_completion_date)}
                  </TD>
                </TR>
              ))}
            </tbody>
            <TFoot>
              <tr>
                <TD colSpan={3}>{t.common.total}</TD>
                <TD align="right">{formatNumber(locale, total("plotCount"))}</TD>
                <TD align="right">{formatNumber(locale, total("unitCount"))}</TD>
                <TD align="right">{formatNumber(locale, total("available"))}</TD>
                <TD align="right">{formatNumber(locale, total("sold"))}</TD>
                <TD />
                <TD align="right">{formatMoney(locale, total("value"))}</TD>
                <TD />
              </tr>
            </TFoot>
          </Table>
        ) : all.length ? (
          <EmptyState title={t.common.noResults} />
        ) : (
          <EmptyState
            icon={<Building2 />}
            title={t.projects.empty}
            body={t.projects.emptyBody}
            action={newProject}
          />
        )}
      </Panel>
    </>
  );
}
