import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { toNumber } from "@/lib/format";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** First and last day of a YYYY-MM month, plus the month before and after for navigation. */
export function monthRange(month: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  const now = new Date();
  const y = m ? Number(m[1]) : now.getUTCFullYear();
  const mo = m ? Number(m[2]) - 1 : now.getUTCMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const first = new Date(Date.UTC(y, mo, 1));
  const last = new Date(Date.UTC(y, mo + 1, 0));
  const ym = (d: Date) => iso(d).slice(0, 7);
  return {
    month: ym(first),
    from: iso(first),
    to: iso(last),
    /** Exclusive upper bound for timestamps. */
    toExclusive: iso(new Date(Date.UTC(y, mo + 1, 1))),
    prev: ym(new Date(Date.UTC(y, mo - 1, 1))),
    next: ym(new Date(Date.UTC(y, mo + 1, 1))),
  };
}

/** The month before the current one, as YYYY-MM (what the monthly notice links to). */
export const lastMonth = () => monthRange(new Date().toISOString().slice(0, 7)).prev;

const sum = (rows: { amount?: unknown }[] | null) =>
  (rows ?? []).reduce((a, r) => a + toNumber(r.amount), 0);

/**
 * One project's activity in a month, read through the person's own session (RLS decides what they
 * see; sections they can't see come back empty and are flagged). Figures are activity dated in the
 * month; the current-status block is as of today and labelled so.
 */
export async function loadMonthlyReport(supabase: Supabase, projectId: string, month: string) {
  const r = monthRange(month);

  const [
    { data: finance },
    { data: bookings },
    { data: contracts },
    { data: cancelled },
    { data: payments },
    { data: verified },
    { data: defectsOpened },
    { data: defectsClosed },
    { data: srOpened },
    { data: srClosed },
    { data: handovers },
    { data: docs },
    { data: units },
    { data: outstanding },
  ] = await Promise.all([
    supabase.rpc("can_view_finance", { target_project: projectId }),
    supabase
      .from("bookings")
      .select("id,agreed_price,status")
      .eq("project_id", projectId)
      .gte("booking_date", r.from)
      .lte("booking_date", r.to),
    supabase
      .from("sales_contracts")
      .select("id")
      .eq("project_id", projectId)
      .eq("status", "SIGNED")
      .gte("signed_on", r.from)
      .lte("signed_on", r.to),
    supabase
      .from("bookings")
      .select("id")
      .eq("project_id", projectId)
      .eq("status", "CANCELLED")
      .gte("cancelled_at", r.from)
      .lt("cancelled_at", r.toExclusive),
    supabase
      .from("payments")
      .select("amount,imported")
      .eq("project_id", projectId)
      .eq("status", "VALID")
      .gte("paid_on", r.from)
      .lte("paid_on", r.to),
    supabase
      .from("progress_updates")
      .select("activity_id,unit_id,verified_percent")
      .eq("project_id", projectId)
      .not("verified_at", "is", null)
      .gte("verified_at", r.from)
      .lt("verified_at", r.toExclusive),
    supabase
      .from("defects")
      .select("severity")
      .eq("project_id", projectId)
      .gte("created_at", r.from)
      .lt("created_at", r.toExclusive),
    supabase
      .from("defects")
      .select("id")
      .eq("project_id", projectId)
      .eq("status", "VERIFIED")
      .gte("verified_at", r.from)
      .lt("verified_at", r.toExclusive),
    supabase
      .from("service_requests")
      .select("id")
      .eq("project_id", projectId)
      .gte("created_at", r.from)
      .lt("created_at", r.toExclusive),
    supabase
      .from("service_requests")
      .select("id")
      .eq("project_id", projectId)
      .gte("resolved_at", r.from)
      .lt("resolved_at", r.toExclusive),
    supabase
      .from("unit_handovers")
      .select("unit_id")
      .eq("project_id", projectId)
      .gte("handover_date", r.from)
      .lte("handover_date", r.to),
    supabase
      .from("financial_documents")
      .select("document_type,amount")
      .eq("project_id", projectId)
      .eq("status", "POSTED")
      .gte("document_date", r.from)
      .lte("document_date", r.to),
    supabase.from("units").select("id,status").eq("project_id", projectId),
    supabase
      .from("payment_schedule_status")
      .select("outstanding,payment_status")
      .eq("project_id", projectId)
      .eq("status", "ACTIVE"),
  ]);

  const active = (bookings ?? []).filter((b) => b.status !== "CANCELLED");
  const docSum = (type: string) =>
    sum((docs ?? []).filter((d) => d.document_type === type) as { amount: unknown }[]);
  const unitStatus = (units ?? []).reduce<Record<string, number>>((a, u) => {
    a[u.status] = (a[u.status] ?? 0) + 1;
    return a;
  }, {});
  const severities = (defectsOpened ?? []).reduce<Record<string, number>>((a, d) => {
    a[d.severity] = (a[d.severity] ?? 0) + 1;
    return a;
  }, {});

  return {
    range: r,
    finance: finance === true,
    sales: {
      bookings: active.length,
      bookingValue: active.reduce((a, b) => a + toNumber(b.agreed_price), 0),
      contractsSigned: (contracts ?? []).length,
      cancellations: (cancelled ?? []).length,
    },
    collections: {
      received: sum(payments),
      receipts: (payments ?? []).length,
      importedReceipts: (payments ?? []).filter((p) => p.imported).length,
    },
    construction: {
      verifications: (verified ?? []).length,
      activitiesCompleted: new Set(
        (verified ?? [])
          .filter((v) => toNumber(v.verified_percent) >= 100)
          .map((v) => v.activity_id),
      ).size,
      housesWorkedOn: new Set((verified ?? []).map((v) => v.unit_id).filter(Boolean)).size,
    },
    quality: {
      defectsOpened: (defectsOpened ?? []).length,
      defectsBySeverity: severities,
      defectsClosed: (defectsClosed ?? []).length,
      serviceOpened: (srOpened ?? []).length,
      serviceResolved: (srClosed ?? []).length,
    },
    handovers: (handovers ?? []).length,
    cost: {
      invoices: docSum("AP"),
      paid: docSum("PAYMENT"),
    },
    today: {
      units: (units ?? []).length,
      unitStatus,
      outstanding: (outstanding ?? []).reduce((a, s) => a + toNumber(s.outstanding), 0),
      overdue: (outstanding ?? [])
        .filter((s) => s.payment_status === "OVERDUE")
        .reduce((a, s) => a + toNumber(s.outstanding), 0),
    },
  };
}

export type MonthlyReport = Awaited<ReturnType<typeof loadMonthlyReport>>;
