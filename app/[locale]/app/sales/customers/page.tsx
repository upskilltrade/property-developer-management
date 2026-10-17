import type { Metadata } from "next";
import Link from "next/link";
import { Contact } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";

export const metadata: Metadata = { title: "Customers" };

/** Customers this account may see (RLS: their projects' sales, customer relations or finance). */
export default async function Customers({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { q } = await searchParams;
  const { supabase } = await getSession(locale);
  const s = t.sales;
  const c = s.customer360;

  let query = supabase
    .from("customers")
    .select(
      "id,full_name,phone,email,primary_profile_id,created_at,unit_sales(status,units(code,projects(code)))",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (q) {
    const term = q.replace(/[%,()]/g, " ").trim();
    query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
  }
  const { data: customers } = await query;
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);

  return (
    <Panel
      title={s.tabs.customers}
      actions={<span className="text-2xs text-muted num">{customers?.length ?? 0}</span>}
    >
      <form className="flex flex-wrap items-center gap-2 border-b border-line bg-subtle px-4 py-2">
        <Input name="q" defaultValue={q ?? ""} placeholder={c.searchPlaceholder} className="w-64" />
        <button
          type="submit"
          className="h-8 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium hover:bg-subtle"
        >
          {t.common.search}
        </button>
      </form>
      {customers?.length ? (
        <Table>
          <THead>
            <tr>
              <TH>{s.fields.name}</TH>
              <TH>{s.fields.phone}</TH>
              <TH>{s.fields.email}</TH>
              <TH>{c.units}</TH>
              <TH>{c.portal}</TH>
              <TH>{t.common.date}</TH>
            </tr>
          </THead>
          <tbody>
            {customers.map((cu) => (
              <TR key={cu.id}>
                <TD>
                  <Link
                    href={`/${locale}/app/sales/customers/${cu.id}`}
                    className="font-medium hover:text-brand hover:underline"
                  >
                    {cu.full_name}
                  </Link>
                </TD>
                <TD className="text-muted">{cu.phone ?? "—"}</TD>
                <TD className="text-muted">{cu.email ?? "—"}</TD>
                <TD className="text-muted">
                  {(cu.unit_sales ?? [])
                    .map((us) => {
                      const u = one(us.units);
                      return u ? `${one(u.projects)?.code ?? ""} ${u.code}`.trim() : null;
                    })
                    .filter(Boolean)
                    .join(", ") || "—"}
                </TD>
                <TD>
                  <Badge tone={cu.primary_profile_id ? "success" : "neutral"}>
                    {cu.primary_profile_id ? c.portalLinked : c.portalNotLinked}
                  </Badge>
                </TD>
                <TD className="text-muted">{formatDate(locale, cu.created_at)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<Contact />} title={q ? t.common.noResults : c.noCustomers} />
      )}
    </Panel>
  );
}
