import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDateTime, formatMoney, formatMonth, formatNumber } from "@/lib/format";
import { lastMonth, loadMonthlyReport, monthRange } from "@/lib/monthly-report";
import { PrintButton } from "@/components/ui/print-button";

export const metadata: Metadata = { title: "Monthly report" };

/** Printable monthly report for one project: what happened in the month, plus today's status. */
export default async function MonthlyReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ project?: string; month?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const q = await searchParams;
  const { supabase, isInternal } = await getSession(locale);
  if (!isInternal) redirect(`/${locale}/app/access-denied`);
  const m = t.monthlyReport;

  const { data: projects } = await supabase.from("projects").select("id,code,name").order("code");
  const project = (projects ?? []).find((p) => p.id === q.project) ?? projects?.[0];
  const month = monthRange(q.month ?? lastMonth()).month;
  const base = `/${locale}/report/monthly`;
  const link = (mo: string, pid = project?.id) =>
    `${base}?${new URLSearchParams({ month: mo, ...(pid ? { project: pid } : {}) })}`;

  if (!project) {
    return (
      <p className="mx-auto mt-16 max-w-md text-center text-[13px] text-muted">{m.noProject}</p>
    );
  }
  const r = await loadMonthlyReport(supabase, project.id, month);
  const money = (v: number) => formatMoney(locale, v);
  const n = (v: number) => formatNumber(locale, v);
  const restricted = <span className="text-faint">{m.restricted}</span>;

  const sections: { title: string; rows: [string, React.ReactNode][] }[] = [
    {
      title: m.sales,
      rows: [
        [m.bookings, `${n(r.sales.bookings)} · ${money(r.sales.bookingValue)}`],
        [m.contractsSigned, n(r.sales.contractsSigned)],
        [m.cancellations, n(r.sales.cancellations)],
      ],
    },
    {
      title: m.collections,
      rows: r.finance
        ? [
            [m.received, money(r.collections.received)],
            [
              m.receipts,
              `${n(r.collections.receipts)}${r.collections.importedReceipts ? ` (${m.imported.replace("{n}", n(r.collections.importedReceipts))})` : ""}`,
            ],
          ]
        : [[m.received, restricted]],
    },
    {
      title: m.construction,
      rows: [
        [m.verifications, n(r.construction.verifications)],
        [m.activitiesCompleted, n(r.construction.activitiesCompleted)],
        [m.housesWorkedOn, n(r.construction.housesWorkedOn)],
        [m.handovers, n(r.handovers)],
      ],
    },
    {
      title: m.quality,
      rows: [
        [
          m.defectsOpened,
          `${n(r.quality.defectsOpened)}${
            r.quality.defectsOpened
              ? ` (${Object.entries(r.quality.defectsBySeverity)
                  .map(([s, c]) => `${label(t.status.severity, s)} ${c}`)
                  .join(" · ")})`
              : ""
          }`,
        ],
        [m.defectsClosed, n(r.quality.defectsClosed)],
        [m.serviceOpened, n(r.quality.serviceOpened)],
        [m.serviceResolved, n(r.quality.serviceResolved)],
      ],
    },
    {
      title: m.cost,
      rows: r.finance
        ? [
            [m.invoices, money(r.cost.invoices)],
            [m.paid, money(r.cost.paid)],
          ]
        : [[m.invoices, restricted]],
    },
  ];

  return (
    <main className="mx-auto my-6 max-w-3xl px-4 print:my-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={`/${locale}/app/control`}
          className="inline-flex items-center gap-1 text-[13px] text-brand hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          {t.control.title}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex items-center gap-1" action={base}>
            <input type="hidden" name="month" value={month} />
            <select
              name="project"
              defaultValue={project.id}
              aria-label={m.project}
              className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[13px]"
            >
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-8 rounded-md border border-line-strong px-2 text-[13px] hover:bg-subtle"
            >
              {t.common.filter}
            </button>
          </form>
          <Link
            href={link(r.range.prev)}
            aria-label={m.prev}
            className="grid size-8 place-items-center rounded-md border border-line-strong hover:bg-subtle"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <Link
            href={link(r.range.next)}
            aria-label={m.next}
            className="grid size-8 place-items-center rounded-md border border-line-strong hover:bg-subtle"
          >
            <ChevronRight className="size-4" />
          </Link>
          <PrintButton label={m.print} />
        </div>
      </div>

      <article className="rounded-lg border border-line bg-surface p-6 shadow-xs print:border-0 print:p-0 print:shadow-none">
        <header className="border-b border-line pb-3">
          <p className="text-2xs text-muted">{m.title}</p>
          <h1 className="text-xl font-semibold">
            {project.code} · {project.name}
          </h1>
          <p className="text-[13px] text-ink-2">
            {formatMonth(locale, r.range.from)} ({r.range.from} – {r.range.to})
          </p>
        </header>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {sections.map((s) => (
            <section key={s.title} className="break-inside-avoid rounded-md border border-line">
              <h2 className="border-b border-line bg-subtle px-3 py-1.5 text-[13px] font-semibold">
                {s.title}
              </h2>
              <dl className="divide-y divide-line text-[13px]">
                {s.rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 px-3 py-1.5">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right font-medium num">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}

          <section className="break-inside-avoid rounded-md border border-dashed border-line-strong">
            <h2 className="border-b border-line bg-subtle px-3 py-1.5 text-[13px] font-semibold">
              {m.today}
            </h2>
            <dl className="divide-y divide-line text-[13px]">
              <div className="flex justify-between gap-3 px-3 py-1.5">
                <dt className="text-muted">{m.units}</dt>
                <dd className="text-right font-medium num">{n(r.today.units)}</dd>
              </div>
              {Object.entries(r.today.unitStatus).map(([s, c]) => (
                <div key={s} className="flex justify-between gap-3 px-3 py-1.5">
                  <dt className="text-muted">· {label(t.status.unit, s)}</dt>
                  <dd className="text-right num">{n(c)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 px-3 py-1.5">
                <dt className="text-muted">{m.outstanding}</dt>
                <dd className="text-right font-medium num">
                  {r.finance ? money(r.today.outstanding) : restricted}
                </dd>
              </div>
              <div className="flex justify-between gap-3 px-3 py-1.5">
                <dt className="text-muted">{m.overdue}</dt>
                <dd className="text-right font-medium text-red-700 num">
                  {r.finance ? money(r.today.overdue) : restricted}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <footer className="mt-5 space-y-0.5 text-[10px] text-faint">
          <p>{m.basis}</p>
          <p>
            {m.printed} {formatDateTime(locale, new Date().toISOString())}
          </p>
        </footer>
      </article>
    </main>
  );
}
