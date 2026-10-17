import type { Metadata } from "next";
import Link from "next/link";
import { FileSignature } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatMoney } from "@/lib/format";
import { contractTone } from "@/lib/sales";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Contracts" };

export default async function Contracts({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ project?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { project } = await searchParams;
  const { supabase } = await getSession(locale);
  const s = t.sales;
  const c = s.contract;

  let query = supabase
    .from("sales_contracts")
    .select(
      "id,contract_no,status,current_version,signed_on,customer_id,created_at,units(code),projects(code),customers(full_name),bookings(booking_no),sales_contract_versions(version,contract_price)",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (project) query = query.eq("project_id", project);
  const { data: contracts } = await query;
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);

  return (
    <Panel
      title={s.tabs.contracts}
      actions={<span className="text-2xs text-muted num">{contracts?.length ?? 0}</span>}
    >
      {contracts?.length ? (
        <Table>
          <THead>
            <tr>
              <TH>{c.contractNo}</TH>
              <TH>{s.customer}</TH>
              <TH>{s.fields.unit}</TH>
              <TH>{s.bookingNo}</TH>
              <TH align="right">{c.price}</TH>
              <TH>{c.version}</TH>
              <TH>{c.signedOn}</TH>
              <TH>{t.common.status}</TH>
            </tr>
          </THead>
          <tbody>
            {contracts.map((k) => {
              const current = (k.sales_contract_versions ?? []).find(
                (v) => v.version === k.current_version,
              );
              return (
                <TR key={k.id}>
                  <TD>
                    <Link
                      href={`/${locale}/app/sales/contracts/${k.id}`}
                      className="font-mono text-[12px] font-medium hover:text-brand hover:underline"
                    >
                      {k.contract_no}
                    </Link>
                  </TD>
                  <TD>
                    <Link
                      href={`/${locale}/app/sales/customers/${k.customer_id}`}
                      className="hover:text-brand hover:underline"
                    >
                      {one(k.customers)?.full_name}
                    </Link>
                  </TD>
                  <TD className="text-muted">
                    {one(k.projects)?.code} · {one(k.units)?.code}
                  </TD>
                  <TD className="font-mono text-[12px] text-muted">
                    {one(k.bookings)?.booking_no}
                  </TD>
                  <TD align="right">{formatMoney(locale, current?.contract_price)}</TD>
                  <TD className="text-muted num">v{k.current_version}</TD>
                  <TD className="text-muted">{formatDate(locale, k.signed_on)}</TD>
                  <TD>
                    <Badge tone={contractTone[k.status] ?? "neutral"}>
                      {label(t.status.contract, k.status)}
                    </Badge>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<FileSignature />} title={c.noContracts} />
      )}
    </Panel>
  );
}
