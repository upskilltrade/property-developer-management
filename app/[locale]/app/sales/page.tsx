import type { Metadata } from "next";
import Link from "next/link";
import { Phone } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatMoneyCompact } from "@/lib/format";
import { daysFromNow, leadStages } from "@/lib/sales";
import { Kpi, KpiStrip } from "@/components/ui/kpi";
import { cn } from "@/components/ui/cn";

export const metadata: Metadata = { title: "Sales pipeline" };

const columnTone: Record<string, string> = {
  NEW: "border-t-slate-400",
  CONTACTED: "border-t-sky-500",
  QUALIFIED: "border-t-violet-500",
  VIEWING: "border-t-blue-600",
  NEGOTIATION: "border-t-amber-500",
  BOOKED: "border-t-emerald-500",
};

/** Kanban of open leads by stage, plus funnel KPIs. Lost leads are counted, not shown. */
export default async function SalesPipeline({
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
  const base = `/${locale}/app/sales`;

  let leadsQuery = supabase
    .from("leads")
    .select(
      "id,lead_no,project_id,full_name,phone,source,stage,budget,created_at,last_activity_at,projects(code)",
    )
    .order("last_activity_at", { ascending: false })
    .limit(500);
  let viewingsQuery = supabase
    .from("viewings")
    .select("id", { count: "exact", head: true })
    .eq("status", "SCHEDULED")
    .gte("scheduled_at", new Date().toISOString())
    .lte("scheduled_at", new Date(daysFromNow(7)).toISOString());
  const monthStart = new Date();
  monthStart.setDate(1);
  let bookingsQuery = supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .neq("status", "CANCELLED")
    .gte("booking_date", monthStart.toISOString().slice(0, 10));
  if (project) {
    leadsQuery = leadsQuery.eq("project_id", project);
    viewingsQuery = viewingsQuery.eq("project_id", project);
    bookingsQuery = bookingsQuery.eq("project_id", project);
  }
  const [{ data: leadRows }, { count: viewingsSoon }, { count: bookingsMonth }] = await Promise.all(
    [leadsQuery, viewingsQuery, bookingsQuery],
  );
  const leads = leadRows ?? [];
  const weekAgo = daysFromNow(-7);
  const open = leads.filter((l) => !["BOOKED", "LOST"].includes(l.stage));
  const booked = leads.filter((l) => l.stage === "BOOKED").length;
  const lost = leads.filter((l) => l.stage === "LOST").length;
  const closed = booked + lost;
  const columns = leadStages.filter((st) => st !== "LOST");

  return (
    <div className="space-y-4">
      <KpiStrip cols={5}>
        <Kpi label={s.kpi.open} value={open.length} />
        <Kpi
          label={s.kpi.newThisWeek}
          value={leads.filter((l) => new Date(l.created_at).getTime() > weekAgo).length}
        />
        <Kpi label={s.kpi.viewings} value={viewingsSoon ?? 0} />
        <Kpi label={s.kpi.bookings} value={bookingsMonth ?? 0} tone="positive" />
        <Kpi
          label={s.kpi.conversion}
          value={closed ? `${Math.round((booked / closed) * 100)}%` : "—"}
          sub={`${label(t.status.leadStage, "BOOKED")} ${booked} · ${label(t.status.leadStage, "LOST")} ${lost}`}
        />
      </KpiStrip>

      <div className="grid gap-3 overflow-x-auto pb-2 lg:grid-cols-6">
        {columns.map((stage) => {
          const items = leads.filter((l) => l.stage === stage);
          return (
            <section
              key={stage}
              className={cn(
                "min-w-56 rounded-lg border border-t-4 lg:min-w-0 border-line bg-subtle/60",
                columnTone[stage],
              )}
            >
              <header className="flex items-center justify-between px-3 py-2 text-[12px] font-semibold">
                {label(t.status.leadStage, stage)}
                <span className="rounded bg-surface px-1.5 text-2xs text-muted num">
                  {items.length}
                </span>
              </header>
              <ul className="space-y-2 px-2 pb-2">
                {items.slice(0, 40).map((l) => {
                  const proj = Array.isArray(l.projects) ? l.projects[0] : l.projects;
                  return (
                    <li key={l.id}>
                      <Link
                        href={`${base}/leads/${l.id}`}
                        className="block rounded-md border border-line bg-surface p-2.5 shadow-xs transition-colors hover:border-brand/40"
                      >
                        <p className="truncate text-[13px] font-medium">{l.full_name}</p>
                        <p className="mt-0.5 flex items-center gap-1 truncate text-2xs text-muted">
                          {l.phone ? (
                            <>
                              <Phone className="size-3" />
                              {l.phone}
                            </>
                          ) : (
                            l.lead_no
                          )}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-faint">
                          <span className="truncate">
                            {proj?.code} · {label(t.status.leadSource, l.source)}
                          </span>
                          <span className="shrink-0">
                            {l.budget
                              ? formatMoneyCompact(locale, l.budget)
                              : formatDate(locale, l.last_activity_at)}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
                {!items.length ? (
                  <li className="px-1 py-4 text-center text-2xs text-faint">—</li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
