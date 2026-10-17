import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatMoney } from "@/lib/format";
import { leadSources, leadStages, stageTone } from "@/lib/sales";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadList({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ project?: string; q?: string; stage?: string; source?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const q = await searchParams;
  const { supabase } = await getSession(locale);
  const s = t.sales;
  const f = s.fields;

  let query = supabase
    .from("leads")
    .select(
      "id,lead_no,full_name,phone,email,source,campaign,stage,budget,last_activity_at,projects(code),assignee:profiles!leads_assigned_to_fkey(display_name),interested:units!leads_interested_unit_id_fkey(code)",
    )
    .order("last_activity_at", { ascending: false })
    .limit(300);
  if (q.project) query = query.eq("project_id", q.project);
  if (q.stage) query = query.eq("stage", q.stage);
  if (q.source) query = query.eq("source", q.source);
  if (q.q) {
    const term = q.q.replace(/[%,()]/g, " ").trim();
    query = query.or(
      `full_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,lead_no.ilike.%${term}%`,
    );
  }
  const { data: leads } = await query;
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);

  return (
    <Panel
      title={s.tabs.leads}
      actions={<span className="text-2xs text-muted num">{leads?.length ?? 0}</span>}
    >
      <form className="flex flex-wrap items-center gap-2 border-b border-line bg-subtle px-4 py-2">
        {q.project ? <input type="hidden" name="project" value={q.project} /> : null}
        <Input
          name="q"
          defaultValue={q.q ?? ""}
          placeholder={s.searchPlaceholder}
          className="w-64"
        />
        <Select name="stage" defaultValue={q.stage ?? ""} className="w-40">
          <option value="">
            {f.stage}: {t.common.all}
          </option>
          {leadStages.map((x) => (
            <option key={x} value={x}>
              {t.status.leadStage[x]}
            </option>
          ))}
        </Select>
        <Select name="source" defaultValue={q.source ?? ""} className="w-40">
          <option value="">
            {f.source}: {t.common.all}
          </option>
          {leadSources.map((x) => (
            <option key={x} value={x}>
              {t.status.leadSource[x]}
            </option>
          ))}
        </Select>
        <button
          type="submit"
          className="h-8 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium hover:bg-subtle"
        >
          {t.common.filter}
        </button>
      </form>
      {leads?.length ? (
        <Table>
          <THead>
            <tr>
              <TH>{f.name}</TH>
              <TH>{f.phone}</TH>
              <TH>{f.project}</TH>
              <TH>{f.source}</TH>
              <TH>{f.interestedUnit}</TH>
              <TH align="right">{f.budget}</TH>
              <TH>{f.assignedTo}</TH>
              <TH>{f.stage}</TH>
              <TH>{f.lastActivity}</TH>
            </tr>
          </THead>
          <tbody>
            {leads.map((l) => (
              <TR key={l.id}>
                <TD>
                  <Link
                    href={`/${locale}/app/sales/leads/${l.id}`}
                    className="font-medium hover:text-brand hover:underline"
                  >
                    {l.full_name}
                  </Link>
                  <p className="font-mono text-[10px] text-faint">{l.lead_no}</p>
                </TD>
                <TD className="text-muted">{l.phone ?? l.email ?? "—"}</TD>
                <TD className="text-muted">{one(l.projects)?.code}</TD>
                <TD>
                  {label(t.status.leadSource, l.source)}
                  {l.campaign ? <p className="text-[10px] text-muted">{l.campaign}</p> : null}
                </TD>
                <TD className="text-muted">{one(l.interested)?.code ?? "—"}</TD>
                <TD align="right">{l.budget ? formatMoney(locale, l.budget) : "—"}</TD>
                <TD className="text-muted">{one(l.assignee)?.display_name ?? "—"}</TD>
                <TD>
                  <Badge tone={stageTone[l.stage] ?? "neutral"}>
                    {label(t.status.leadStage, l.stage)}
                  </Badge>
                </TD>
                <TD className="text-muted">{formatDate(locale, l.last_activity_at)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState
          icon={<Users />}
          title={q.q || q.stage || q.source ? t.common.noResults : s.noLeads}
        />
      )}
    </Panel>
  );
}
