import type { Metadata } from "next";
import Link from "next/link";
import { Landmark } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatMoney, formatMoneyCompact, toNumber } from "@/lib/format";
import { toneOf } from "@/lib/status";
import { PageHeader } from "@/components/ui/page-header";
import { Kpi, KpiStrip } from "@/components/ui/kpi";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/cn";

export const metadata: Metadata = { title: "Finance" };

export default async function FinanceCenter({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await resolveLocale(params);
  const { supabase } = await getSession(locale);

  const { data: projects } = await supabase
    .from("projects")
    .select("id,code,name,status,currency_code")
    .order("code");
  // Only projects whose finance this person may see.
  const visible = await Promise.all(
    (projects ?? []).map((p) =>
      supabase.rpc("can_view_finance", { target_project: p.id }).then((r) => r.data === true),
    ),
  );
  const ids = (projects ?? []).filter((_, i) => visible[i]).map((p) => p.id);
  const [{ data: budgets }, { data: docs }] = ids.length
    ? await Promise.all([
        supabase
          .from("project_budgets")
          .select("project_id,budget_amount,forecast_amount")
          .in("project_id", ids),
        supabase
          .from("financial_documents")
          .select("project_id,document_type,amount,status,settled_amount")
          .in("project_id", ids)
          .neq("status", "VOID")
          .limit(10000),
      ])
    : [{ data: [] }, { data: [] }];

  const rows = (projects ?? [])
    .filter((p) => ids.includes(p.id))
    .map((p) => {
      const b = (budgets ?? []).filter((x) => x.project_id === p.id);
      const d = (docs ?? []).filter((x) => x.project_id === p.id);
      const posted = d.filter((x) => x.status === "POSTED");
      const sum = (list: typeof d, type: string, open = false) =>
        list
          .filter((x) => x.document_type === type)
          .reduce(
            (n, x) =>
              n +
              (open
                ? Math.max(0, toNumber(x.amount) - toNumber(x.settled_amount))
                : toNumber(x.amount)),
            0,
          );
      const approved = d.filter((x) => ["APPROVED", "POSTED"].includes(x.status));
      return {
        ...p,
        budget: b.reduce((n, x) => n + toNumber(x.budget_amount), 0),
        forecast: b.reduce((n, x) => n + toNumber(x.forecast_amount), 0),
        committed: sum(approved, "COMMITMENT"),
        cashIn: sum(posted, "RECEIPT"),
        cashOut: sum(posted, "PAYMENT"),
        ar: sum(approved, "AR", true),
        ap: sum(approved, "AP", true),
        drafts: d.filter((x) => x.status === "DRAFT").length,
      };
    });
  type Key = "budget" | "forecast" | "committed" | "cashIn" | "cashOut" | "ar" | "ap";
  const total = (k: Key) => rows.reduce((n, r) => n + r[k], 0);
  const net = total("cashIn") - total("cashOut");

  return (
    <>
      <PageHeader
        title={t.finance.title}
        subtitle={t.finance.subtitle}
        crumbs={[{ label: t.nav.dashboard, href: `/${locale}/app` }, { label: t.finance.title }]}
      />
      <KpiStrip>
        <Kpi
          label={t.finance.kpi.budget}
          value={formatMoneyCompact(locale, total("budget"))}
          sub={`${t.finance.kpi.forecast} ${formatMoneyCompact(locale, total("forecast"))}`}
        />
        <Kpi
          label={t.finance.kpi.committed}
          value={formatMoneyCompact(locale, total("committed"))}
        />
        <Kpi
          label={t.finance.kpi.cashIn}
          value={formatMoneyCompact(locale, total("cashIn"))}
          tone="positive"
        />
        <Kpi
          label={t.finance.kpi.cashOut}
          value={formatMoneyCompact(locale, total("cashOut"))}
          tone="negative"
        />
        <Kpi label={t.finance.kpi.ar} value={formatMoneyCompact(locale, total("ar"))} />
        <Kpi
          label={t.finance.kpi.ap}
          value={formatMoneyCompact(locale, total("ap"))}
          sub={`${t.dashboard.kpi.netCash} ${formatMoneyCompact(locale, net)}`}
        />
      </KpiStrip>

      <Panel className="mt-4" title={t.dashboard.portfolio}>
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <TH>{t.common.code}</TH>
                <TH>{t.finance.fields.project}</TH>
                <TH>{t.common.status}</TH>
                <TH align="right">{t.finance.kpi.budget}</TH>
                <TH align="right">{t.finance.kpi.forecast}</TH>
                <TH align="right">{t.finance.kpi.committed}</TH>
                <TH align="right">{t.finance.kpi.cashIn}</TH>
                <TH align="right">{t.finance.kpi.cashOut}</TH>
                <TH align="right">{t.dashboard.kpi.netCash}</TH>
                <TH align="right">{t.finance.kpi.ar}</TH>
                <TH align="right">{t.finance.kpi.ap}</TH>
                <TH align="right">{t.status.document.DRAFT}</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => {
                const rowNet = r.cashIn - r.cashOut;
                return (
                  <TR key={r.id}>
                    <TD className="font-mono text-2xs text-muted">{r.code}</TD>
                    <TD>
                      <Link
                        href={`/${locale}/app/projects/${r.id}/finance`}
                        className="font-medium hover:text-brand hover:underline"
                      >
                        {r.name}
                      </Link>
                    </TD>
                    <TD>
                      <Badge tone={toneOf(r.status)}>{label(t.status.project, r.status)}</Badge>
                    </TD>
                    <TD align="right">{formatMoney(locale, r.budget)}</TD>
                    <TD align="right">{formatMoney(locale, r.forecast)}</TD>
                    <TD align="right">{formatMoney(locale, r.committed)}</TD>
                    <TD align="right" className="text-emerald-700">
                      {formatMoney(locale, r.cashIn)}
                    </TD>
                    <TD align="right" className="text-red-700">
                      {formatMoney(locale, r.cashOut)}
                    </TD>
                    <TD align="right" className={cn("font-semibold", rowNet < 0 && "text-red-700")}>
                      {formatMoney(locale, rowNet)}
                    </TD>
                    <TD align="right">{formatMoney(locale, r.ar)}</TD>
                    <TD align="right">{formatMoney(locale, r.ap)}</TD>
                    <TD align="right">
                      {r.drafts ? (
                        <Badge tone="warning">{r.drafts}</Badge>
                      ) : (
                        <span className="text-faint">0</span>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
            <TFoot>
              <tr>
                <TD colSpan={3}>{t.common.total}</TD>
                <TD align="right">{formatMoney(locale, total("budget"))}</TD>
                <TD align="right">{formatMoney(locale, total("forecast"))}</TD>
                <TD align="right">{formatMoney(locale, total("committed"))}</TD>
                <TD align="right">{formatMoney(locale, total("cashIn"))}</TD>
                <TD align="right">{formatMoney(locale, total("cashOut"))}</TD>
                <TD align="right">{formatMoney(locale, net)}</TD>
                <TD align="right">{formatMoney(locale, total("ar"))}</TD>
                <TD align="right">{formatMoney(locale, total("ap"))}</TD>
                <TD />
              </tr>
            </TFoot>
          </Table>
        ) : (
          <EmptyState icon={<Landmark />} title={t.projects.empty} />
        )}
      </Panel>
    </>
  );
}
