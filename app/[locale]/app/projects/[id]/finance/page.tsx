import { FileText } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatMoney, formatMoneyCompact, toNumber, today } from "@/lib/format";
import { toneOf } from "@/lib/status";
import { Kpi, KpiStrip } from "@/components/ui/kpi";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/components/ui/cn";
import { DocumentForm } from "@/components/domain/document-form";
import {
  approveFinancialDocument,
  approveProcurementContract,
  createCostAllocation,
  createFinancialDocument,
  createProcurementContract,
  postApprovedFinancialDocument,
  postCostAllocation,
  postFinancialDocument,
} from "./actions";

type Summary = Record<
  | "budget"
  | "forecast"
  | "opening_cash"
  | "cash_in"
  | "cash_out"
  | "closing_cash"
  | "ap_outstanding"
  | "ar_outstanding"
  | "committed"
  | "actual"
  | "customer_deposits",
  number | string | null
> & { latest_date: string | null };

const tabs = ["documents", "contracts", "allocations", "budget"] as const;
type Tab = (typeof tabs)[number];
const docTypes = ["COMMITMENT", "AP", "AR", "PAYMENT", "RECEIPT"] as const;

export default async function ProjectFinance({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ tab?: string; type?: string; status?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id } = await params;
  const query = await searchParams;
  const tab: Tab = (tabs as readonly string[]).includes(query.tab ?? "")
    ? (query.tab as Tab)
    : "documents";
  const { supabase } = await getSession(locale);
  const base = `/${locale}/app/projects/${id}/finance`;
  const f = t.finance.fields;

  const [
    { data: budgets },
    { data: docs },
    { data: categories },
    { data: contracts },
    { data: summaryRows },
    { data: cashAccounts },
    { data: allocations },
  ] = await Promise.all([
    supabase
      .from("project_budgets")
      .select("budget_amount,forecast_amount,cost_categories(code,name,category_type)")
      .eq("project_id", id),
    supabase
      .from("financial_documents")
      .select(
        "id,document_no,document_type,document_date,counterparty_name,amount,status,description,settled_amount,source_document_id,cost_category_id,vat_rate,vat_amount,wht_rate,wht_amount,tax_invoice_no",
      )
      .eq("project_id", id)
      .order("document_date", { ascending: false })
      .limit(500),
    supabase.from("cost_categories").select("id,code,name").eq("active", true).order("code"),
    supabase
      .from("procurement_contracts")
      .select(
        "id,contract_no,contract_type,vendor_name,amount,status,contract_date,description,cost_category_id",
      )
      .eq("project_id", id)
      .order("contract_date", { ascending: false })
      .limit(200),
    supabase.rpc("get_project_finance_summary_v2", { target_project: id }),
    supabase
      .from("cash_accounts")
      .select("id,code,name,account_kind")
      .eq("active", true)
      .order("code"),
    supabase
      .from("cost_allocation_runs")
      .select("id,allocation_no,allocation_date,method,source_amount,status,description")
      .eq("project_id", id)
      .order("allocation_date", { ascending: false })
      .limit(100),
  ]);

  const s = (summaryRows?.[0] ?? null) as Summary | null;
  const budget = toNumber(s?.budget);
  const actual = toNumber(s?.actual);
  const allDocs = docs ?? [];
  const categoryName = new Map((categories ?? []).map((c) => [c.id, `${c.code} · ${c.name}`]));
  const outstanding = (d: { amount: unknown; settled_amount: unknown }) =>
    Math.max(0, toNumber(d.amount) - toNumber(d.settled_amount));
  const openInvoices = allDocs
    .filter(
      (d) =>
        ["AP", "AR"].includes(d.document_type) &&
        ["APPROVED", "POSTED"].includes(d.status) &&
        outstanding(d) > 0,
    )
    .map((d) => ({
      id: d.id,
      type: d.document_type,
      label: `${d.document_no} · ${d.counterparty_name ?? "—"} · ${formatMoney(locale, outstanding(d))}`,
    }));
  const filteredDocs = allDocs.filter(
    (d) =>
      (!query.type || d.document_type === query.type) &&
      (!query.status || d.status === query.status),
  );
  const hiddenBase = <Hidden values={{ locale, project_id: id }} />;

  const counts: Record<Tab, number> = {
    documents: allDocs.length,
    contracts: (contracts ?? []).length,
    allocations: (allocations ?? []).length,
    budget: (budgets ?? []).length,
  };

  return (
    <div className="space-y-4">
      <KpiStrip>
        <Kpi
          label={t.finance.kpi.budget}
          value={formatMoneyCompact(locale, budget)}
          sub={`${t.finance.kpi.forecast} ${formatMoneyCompact(locale, s?.forecast)}`}
        />
        <Kpi
          label={t.finance.kpi.actual}
          value={formatMoneyCompact(locale, actual)}
          sub={`${t.finance.kpi.remaining} ${formatMoneyCompact(locale, budget - actual)}`}
          tone={budget && actual > budget ? "negative" : "default"}
        />
        <Kpi label={t.finance.kpi.committed} value={formatMoneyCompact(locale, s?.committed)} />
        <Kpi
          label={t.finance.kpi.closingCash}
          value={formatMoneyCompact(locale, s?.closing_cash)}
          sub={`${t.finance.kpi.cashIn} ${formatMoneyCompact(locale, s?.cash_in)} · ${t.finance.kpi.cashOut} ${formatMoneyCompact(locale, s?.cash_out)}`}
          tone={toNumber(s?.closing_cash) < 0 ? "negative" : "positive"}
        />
        <Kpi
          label={t.finance.kpi.ar}
          value={formatMoneyCompact(locale, s?.ar_outstanding)}
          sub={`${t.finance.kpi.deposits} ${formatMoneyCompact(locale, s?.customer_deposits)}`}
        />
        <Kpi
          label={t.finance.kpi.ap}
          value={formatMoneyCompact(locale, s?.ap_outstanding)}
          tone={toNumber(s?.ap_outstanding) > 0 ? "negative" : "default"}
        />
      </KpiStrip>

      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-2 px-4 pt-2">
          <Tabs
            active={tab}
            items={tabs.map((k) => ({
              key: k,
              label: t.finance.tabs[k],
              href: `${base}?tab=${k}`,
              count: counts[k],
            }))}
          />
          <div className="pb-2">
            {tab === "documents" ? (
              <Sheet title={t.finance.newDocument} triggerLabel={t.finance.newDocument}>
                <DocumentForm
                  t={{ finance: t.finance, status: t.status, common: t.common }}
                  locale={locale}
                  projectId={id}
                  action={createFinancialDocument}
                  categories={(categories ?? []).map((c) => ({
                    id: c.id,
                    label: `${c.code} · ${c.name}`,
                  }))}
                  cashAccounts={(cashAccounts ?? []).map((c) => ({
                    id: c.id,
                    label: `${c.code} · ${c.name} (${c.account_kind})`,
                  }))}
                  openInvoices={openInvoices}
                  defaultDate={today()}
                />
              </Sheet>
            ) : tab === "contracts" ? (
              <Sheet title={t.finance.newContract} triggerLabel={t.finance.newContract}>
                <form action={createProcurementContract} className="space-y-3">
                  {hiddenBase}
                  <FormGrid>
                    <Field label={f.contractType}>
                      <Select name="contract_type" defaultValue="PO">
                        <option value="PO">{t.status.contractType.PO}</option>
                        <option value="CONTRACT">{t.status.contractType.CONTRACT}</option>
                      </Select>
                    </Field>
                    <Field label={f.contractDate}>
                      <Input name="contract_date" type="date" defaultValue={today()} />
                    </Field>
                  </FormGrid>
                  <Field label={f.vendor} required>
                    <Input name="vendor_name" required />
                  </Field>
                  <Field label={f.costCategory} required>
                    <Select name="cost_category_id" required defaultValue="">
                      <option value="" disabled>
                        —
                      </option>
                      {(categories ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} · {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={`${f.amount} (THB)`} required>
                    <Input name="amount" type="number" min="0.01" step="0.01" required />
                  </Field>
                  <Field label={t.common.description}>
                    <Textarea name="description" />
                  </Field>
                  <SheetFooter>
                    <SubmitButton>{t.common.save}</SubmitButton>
                  </SheetFooter>
                </form>
              </Sheet>
            ) : tab === "allocations" ? (
              <Sheet title={t.finance.newAllocation} triggerLabel={t.finance.newAllocation}>
                <form action={createCostAllocation} className="space-y-3">
                  {hiddenBase}
                  <Field label={f.method}>
                    <Select name="method" defaultValue="LAND_AREA">
                      {(["LAND_AREA", "GFA", "SALES_VALUE"] as const).map((m) => (
                        <option key={m} value={m}>
                          {t.status.allocationMethod[m]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={f.sourceDocument}>
                    <Select name="source_document_id" defaultValue="">
                      <option value="">{f.noSource}</option>
                      {allDocs
                        .filter(
                          (d) =>
                            ["AP", "PAYMENT"].includes(d.document_type) && d.status === "POSTED",
                        )
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.document_no} · {formatMoney(locale, d.amount)}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field label={`${f.sourceAmount} (THB)`} required>
                    <Input name="source_amount" type="number" min="0.01" step="0.01" required />
                  </Field>
                  <Field label={t.common.description}>
                    <Textarea name="description" />
                  </Field>
                  <SheetFooter>
                    <SubmitButton>{t.common.save}</SubmitButton>
                  </SheetFooter>
                </form>
              </Sheet>
            ) : null}
          </div>
        </div>

        {tab === "documents" ? (
          <>
            <form className="flex flex-wrap items-center gap-2 border-b border-line bg-subtle px-4 py-2">
              <input type="hidden" name="tab" value="documents" />
              <Select name="type" defaultValue={query.type ?? ""} className="w-48">
                <option value="">
                  {f.documentType}: {t.common.all}
                </option>
                {docTypes.map((x) => (
                  <option key={x} value={x}>
                    {t.status.documentType[x]}
                  </option>
                ))}
              </Select>
              <Select name="status" defaultValue={query.status ?? ""} className="w-40">
                <option value="">
                  {t.common.status}: {t.common.all}
                </option>
                {(["DRAFT", "APPROVED", "POSTED", "VOID"] as const).map((x) => (
                  <option key={x} value={x}>
                    {t.status.document[x]}
                  </option>
                ))}
              </Select>
              <button
                type="submit"
                className="h-8 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium hover:bg-subtle"
              >
                {t.common.filter}
              </button>
              <span className="ml-auto text-2xs text-muted num">
                {filteredDocs.length} / {allDocs.length} {t.common.rows}
              </span>
            </form>
            {filteredDocs.length ? (
              <Table>
                <THead>
                  <tr>
                    <TH>{f.documentDate}</TH>
                    <TH>{f.documentNo}</TH>
                    <TH>{f.documentType}</TH>
                    <TH>{f.counterparty}</TH>
                    <TH>{f.costCategory}</TH>
                    <TH align="right">{f.amount}</TH>
                    <TH align="right">VAT / WHT</TH>
                    <TH align="right">{t.finance.outstanding}</TH>
                    <TH>{t.common.status}</TH>
                    <TH align="right">{t.common.actions}</TH>
                  </tr>
                </THead>
                <tbody>
                  {filteredDocs.map((d) => {
                    const isInvoice = ["AP", "AR"].includes(d.document_type);
                    const sign =
                      d.document_type === "RECEIPT"
                        ? "+"
                        : d.document_type === "PAYMENT"
                          ? "−"
                          : "";
                    const actionForm = (
                      action: (fd: FormData) => Promise<void>,
                      text: string,
                      variant: "primary" | "success",
                    ) => (
                      <form action={action} className="inline">
                        <Hidden values={{ locale, project_id: id, document_id: d.id }} />
                        <SubmitButton size="xs" variant={variant}>
                          {text}
                        </SubmitButton>
                      </form>
                    );
                    return (
                      <TR key={d.id}>
                        <TD className="text-muted">{formatDate(locale, d.document_date)}</TD>
                        <TD>
                          <span className="font-mono text-2xs font-medium">{d.document_no}</span>
                          {d.description ? (
                            <p className="max-w-56 truncate text-2xs text-muted">{d.description}</p>
                          ) : null}
                        </TD>
                        <TD>{label(t.status.documentType, d.document_type)}</TD>
                        <TD className="max-w-44 truncate">{d.counterparty_name ?? "—"}</TD>
                        <TD className="max-w-44 truncate text-muted">
                          {d.cost_category_id ? categoryName.get(d.cost_category_id) : "—"}
                        </TD>
                        <TD
                          align="right"
                          className={cn(
                            "font-semibold",
                            sign === "+" && "text-emerald-700",
                            sign === "−" && "text-red-700",
                          )}
                        >
                          {sign}
                          {formatMoney(locale, d.amount)}
                        </TD>
                        <TD align="right" className="text-2xs text-muted">
                          {toNumber(d.vat_amount)
                            ? `VAT ${formatMoney(locale, d.vat_amount)}`
                            : toNumber(d.wht_amount)
                              ? `WHT ${formatMoney(locale, d.wht_amount)}`
                              : "—"}
                        </TD>
                        <TD
                          align="right"
                          className={cn(isInvoice && outstanding(d) > 0 && "text-amber-700")}
                        >
                          {isInvoice ? formatMoney(locale, outstanding(d)) : "—"}
                        </TD>
                        <TD>
                          <Badge tone={toneOf(d.status)}>
                            {label(t.status.document, d.status)}
                          </Badge>
                        </TD>
                        <TD align="right">
                          {d.status === "DRAFT" &&
                          ["COMMITMENT", "AP", "AR"].includes(d.document_type)
                            ? actionForm(approveFinancialDocument, t.finance.approve, "primary")
                            : d.status === "APPROVED" && isInvoice
                              ? actionForm(postApprovedFinancialDocument, t.finance.post, "success")
                              : d.status === "DRAFT" &&
                                  ["PAYMENT", "RECEIPT"].includes(d.document_type)
                                ? actionForm(postFinancialDocument, t.finance.post, "success")
                                : null}
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            ) : (
              <EmptyState
                icon={<FileText />}
                title={allDocs.length ? t.common.noResults : t.finance.noDocuments}
              />
            )}
          </>
        ) : null}

        {tab === "contracts" ? (
          contracts?.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>{f.contractDate}</TH>
                  <TH>{f.contractNo}</TH>
                  <TH>{f.contractType}</TH>
                  <TH>{f.vendor}</TH>
                  <TH>{f.costCategory}</TH>
                  <TH align="right">{f.amount}</TH>
                  <TH>{t.common.status}</TH>
                  <TH align="right">{t.common.actions}</TH>
                </tr>
              </THead>
              <tbody>
                {contracts.map((c) => (
                  <TR key={c.id}>
                    <TD className="text-muted">{formatDate(locale, c.contract_date)}</TD>
                    <TD>
                      <span className="font-mono text-2xs font-medium">{c.contract_no}</span>
                      {c.description ? (
                        <p className="max-w-56 truncate text-2xs text-muted">{c.description}</p>
                      ) : null}
                    </TD>
                    <TD>{label(t.status.contractType, c.contract_type)}</TD>
                    <TD className="max-w-48 truncate font-medium">{c.vendor_name}</TD>
                    <TD className="max-w-44 truncate text-muted">
                      {c.cost_category_id ? categoryName.get(c.cost_category_id) : "—"}
                    </TD>
                    <TD align="right" className="font-semibold">
                      {formatMoney(locale, c.amount)}
                    </TD>
                    <TD>
                      <Badge tone={toneOf(c.status)}>{label(t.status.document, c.status)}</Badge>
                    </TD>
                    <TD align="right">
                      {c.status === "DRAFT" ? (
                        <form action={approveProcurementContract} className="inline">
                          <Hidden values={{ locale, project_id: id, contract_id: c.id }} />
                          <SubmitButton size="xs">{t.finance.approve}</SubmitButton>
                        </form>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </tbody>
              <TFoot>
                <tr>
                  <TD colSpan={5}>{t.common.total}</TD>
                  <TD align="right">
                    {formatMoney(
                      locale,
                      contracts.reduce((a, c) => a + toNumber(c.amount), 0),
                    )}
                  </TD>
                  <TD colSpan={2} />
                </tr>
              </TFoot>
            </Table>
          ) : (
            <EmptyState icon={<FileText />} title={t.finance.noContracts} />
          )
        ) : null}

        {tab === "allocations" ? (
          allocations?.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>{t.common.date}</TH>
                  <TH>{f.allocationNo}</TH>
                  <TH>{f.method}</TH>
                  <TH>{t.common.description}</TH>
                  <TH align="right">{f.sourceAmount}</TH>
                  <TH>{t.common.status}</TH>
                  <TH align="right">{t.common.actions}</TH>
                </tr>
              </THead>
              <tbody>
                {allocations.map((a) => (
                  <TR key={a.id}>
                    <TD className="text-muted">{formatDate(locale, a.allocation_date)}</TD>
                    <TD className="font-mono text-2xs font-medium">{a.allocation_no}</TD>
                    <TD>{label(t.status.allocationMethod, a.method)}</TD>
                    <TD className="max-w-64 truncate text-muted">{a.description || "—"}</TD>
                    <TD align="right" className="font-semibold">
                      {formatMoney(locale, a.source_amount)}
                    </TD>
                    <TD>
                      <Badge tone={toneOf(a.status)}>{label(t.status.document, a.status)}</Badge>
                    </TD>
                    <TD align="right">
                      {a.status === "DRAFT" ? (
                        <form action={postCostAllocation} className="inline">
                          <Hidden values={{ locale, project_id: id, allocation_run_id: a.id }} />
                          <SubmitButton size="xs" variant="success">
                            {t.finance.post}
                          </SubmitButton>
                        </form>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={<FileText />} title={t.finance.noAllocations} />
          )
        ) : null}

        {tab === "budget" ? (
          budgets?.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>{t.common.code}</TH>
                  <TH>{f.category}</TH>
                  <TH>{f.categoryType}</TH>
                  <TH align="right">{t.finance.kpi.budget}</TH>
                  <TH align="right">{t.finance.kpi.forecast}</TH>
                  <TH align="right">Δ</TH>
                </tr>
              </THead>
              <tbody>
                {budgets.map((b, i) => {
                  const cat = Array.isArray(b.cost_categories)
                    ? b.cost_categories[0]
                    : b.cost_categories;
                  const delta = toNumber(b.budget_amount) - toNumber(b.forecast_amount);
                  return (
                    <TR key={i}>
                      <TD className="font-mono text-2xs">{cat?.code ?? "—"}</TD>
                      <TD className="font-medium">{cat?.name ?? "—"}</TD>
                      <TD className="text-muted">{cat?.category_type ?? "—"}</TD>
                      <TD align="right">{formatMoney(locale, b.budget_amount)}</TD>
                      <TD align="right">{formatMoney(locale, b.forecast_amount)}</TD>
                      <TD
                        align="right"
                        className={cn(delta < 0 ? "text-red-700" : "text-emerald-700")}
                      >
                        {formatMoney(locale, delta)}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
              <TFoot>
                <tr>
                  <TD colSpan={3}>{t.common.total}</TD>
                  <TD align="right">
                    {formatMoney(
                      locale,
                      budgets.reduce((a, b) => a + toNumber(b.budget_amount), 0),
                    )}
                  </TD>
                  <TD align="right">
                    {formatMoney(
                      locale,
                      budgets.reduce((a, b) => a + toNumber(b.forecast_amount), 0),
                    )}
                  </TD>
                  <TD align="right">
                    {formatMoney(
                      locale,
                      budgets.reduce(
                        (a, b) => a + toNumber(b.budget_amount) - toNumber(b.forecast_amount),
                        0,
                      ),
                    )}
                  </TD>
                </tr>
              </TFoot>
            </Table>
          ) : (
            <EmptyState icon={<FileText />} title={t.finance.noBudget} />
          )
        ) : null}
      </Panel>
    </div>
  );
}
