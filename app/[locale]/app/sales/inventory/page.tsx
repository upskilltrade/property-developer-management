import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDateTime, formatMoneyCompact } from "@/lib/format";
import { toneOf, unitStatuses } from "@/lib/status";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/cn";

export const metadata: Metadata = { title: "Inventory" };

const cardTone: Record<string, string> = {
  AVAILABLE: "border-l-emerald-500",
  HOLD: "border-l-amber-500",
  RESERVED: "border-l-violet-500",
  CONTRACTED: "border-l-sky-500",
  SOLD: "border-l-sky-700",
  TRANSFERRED: "border-l-slate-400",
  UNAVAILABLE: "border-l-slate-300",
};

/** Sales view of every unit: status, list price, who holds it and until when, and the booking. */
export default async function Inventory({
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

  let projectsQuery = supabase.from("projects").select("id,code,name").order("code");
  if (project) projectsQuery = projectsQuery.eq("id", project);
  const { data: projects } = await projectsQuery;
  // Expired holds release their units before the board is drawn.
  await Promise.all(
    (projects ?? []).map((p) => supabase.rpc("expire_unit_holds", { target_project: p.id })),
  );
  const ids = (projects ?? []).map((p) => p.id);

  const [{ data: units }, { data: holds }, { data: bookings }] = await Promise.all([
    supabase
      .from("units")
      .select("id,code,name,status,list_price,project_id")
      .in("project_id", ids)
      .order("code"),
    supabase
      .from("unit_holds")
      .select("unit_id,expires_at,lead_id,leads(full_name)")
      .in("project_id", ids)
      .eq("status", "ACTIVE"),
    supabase
      .from("bookings")
      .select("unit_id,booking_no,status,lead_id,customers(full_name)")
      .in("project_id", ids)
      .neq("status", "CANCELLED"),
  ]);
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const holdBy = new Map((holds ?? []).map((h) => [h.unit_id, h]));
  const bookingBy = new Map((bookings ?? []).map((b) => [b.unit_id, b]));

  if (!units?.length) return <EmptyState icon={<LayoutGrid />} title={t.common.noResults} />;

  return (
    <div className="space-y-4">
      {(projects ?? []).map((p) => {
        const list = units.filter((u) => u.project_id === p.id);
        if (!list.length) return null;
        const counts = unitStatuses
          .map((st) => [st, list.filter((u) => u.status === st).length] as const)
          .filter(([, n]) => n > 0);
        return (
          <Panel
            key={p.id}
            title={`${p.code} · ${p.name}`}
            actions={
              <div className="flex flex-wrap gap-1.5">
                {counts.map(([st, n]) => (
                  <Badge key={st} tone={toneOf(st)}>
                    {label(t.status.unit, st)} {n}
                  </Badge>
                ))}
              </div>
            }
          >
            <ul className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
              {list.map((u) => {
                const hold = holdBy.get(u.id);
                const booking = bookingBy.get(u.id);
                return (
                  <li
                    key={u.id}
                    className={cn(
                      "rounded-md border border-l-4 border-line bg-surface p-2.5",
                      cardTone[u.status],
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/${locale}/app/projects/${p.id}/units/${u.id}`}
                        className="font-mono text-[13px] font-semibold hover:text-brand hover:underline"
                      >
                        {u.code}
                      </Link>
                      <Badge tone={toneOf(u.status)}>{label(t.status.unit, u.status)}</Badge>
                    </div>
                    <p className="mt-1 text-2xs text-muted num">
                      {u.list_price ? formatMoneyCompact(locale, u.list_price) : "—"}
                      {u.name ? ` · ${u.name}` : ""}
                    </p>
                    {hold ? (
                      <p className="mt-1.5 text-2xs">
                        <span className="text-muted">{s.heldBy}: </span>
                        <Link
                          href={`/${locale}/app/sales/leads/${hold.lead_id}`}
                          className="text-brand hover:underline"
                        >
                          {one(hold.leads)?.full_name}
                        </Link>
                        <span className="block text-faint">
                          {s.expires} {formatDateTime(locale, hold.expires_at)}
                        </span>
                      </p>
                    ) : null}
                    {booking ? (
                      <p className="mt-1.5 text-2xs">
                        <span className="font-mono text-muted">{booking.booking_no}</span>{" "}
                        {booking.lead_id ? (
                          <Link
                            href={`/${locale}/app/sales/leads/${booking.lead_id}`}
                            className="text-brand hover:underline"
                          >
                            {one(booking.customers)?.full_name}
                          </Link>
                        ) : (
                          one(booking.customers)?.full_name
                        )}
                        {booking.status === "PENDING_APPROVAL" ? (
                          <span className="block text-amber-700">{s.pendingApproval}</span>
                        ) : null}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}
