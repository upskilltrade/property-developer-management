import Link from "next/link";
import { AlertTriangle, Clock, Download, FileClock, Lock } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries/th";
import type { Locale } from "@/lib/i18n/config";
import { label } from "@/lib/i18n/label";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { toneOf } from "@/lib/status";
import { handoverTone } from "@/lib/handover";
import { contractTone } from "@/lib/sales";
import {
  agingBuckets,
  funnelStages,
  timelineHref,
  type ApprovalItem,
  type HouseRow,
  type IssueItem,
  type ProjectRow,
  type TimelineEvent,
} from "@/lib/control";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";

type T = Pick<Dictionary, "control" | "status" | "common" | "projects">;
type Base = { t: T; locale: Locale; appBase: string };

const link = "font-medium text-ink hover:text-brand hover:underline";
const num = (v: number) => (v ? v : "—");

export function ExportLink({ href, t }: { href: string; t: T }) {
  return (
    <a
      href={href}
      className="inline-flex h-7 items-center gap-1 rounded-md border border-line-strong bg-surface px-2 text-2xs font-medium text-ink-2 hover:bg-subtle"
    >
      <Download className="size-3.5" />
      {t.control.export}
    </a>
  );
}

export function Restricted({ t }: { t: T }) {
  return (
    <p className="flex items-center gap-2 px-4 py-6 text-2xs text-muted">
      <Lock className="size-3.5" />
      {t.control.restricted}
    </p>
  );
}

/** Horizontal bars: each funnel step against the total number of leads. */
export function FunnelPanel({
  t,
  locale,
  appBase,
  funnel,
}: Base & {
  funnel: {
    stages: Record<string, number>;
    lost: number;
    leads: number;
    bookings: number;
    contracts: number;
    transferred: number;
  };
}) {
  const c = t.control.funnel;
  const steps = [
    ...funnelStages.map((s) => ({
      key: s,
      label: label(t.status.leadStage, s),
      value: funnel.stages[s] ?? 0,
      href: `${appBase}/sales/leads?stage=${s}`,
    })),
    { key: "bk", label: c.bookings, value: funnel.bookings, href: `${appBase}/sales/bookings` },
    { key: "ct", label: c.contracts, value: funnel.contracts, href: `${appBase}/sales/contracts` },
    {
      key: "tr",
      label: c.transferred,
      value: funnel.transferred,
      href: `${appBase}/sales/inventory`,
    },
  ];
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <Panel
      title={c.title}
      description={`${c.leads} ${formatNumber(locale, funnel.leads)} · ${c.lost} ${formatNumber(locale, funnel.lost)}`}
    >
      <ul className="space-y-1.5 px-4 py-3">
        {steps.map((s) => (
          <li key={s.key}>
            <Link
              href={s.href}
              className="group grid grid-cols-[120px_1fr_40px] items-center gap-2"
            >
              <span className="truncate text-2xs text-muted group-hover:text-brand">{s.label}</span>
              <span className="h-2.5 overflow-hidden rounded-sm bg-slate-100">
                <span
                  className="block h-full rounded-sm bg-brand/70"
                  style={{ width: `${(s.value / max) * 100}%` }}
                />
              </span>
              <span className="text-right text-[13px] font-semibold num">{s.value}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function CashPanel({
  t,
  locale,
  projects,
  aging,
  exportHref,
}: Base & {
  projects: ProjectRow[];
  aging: Record<(typeof agingBuckets)[number], number>;
  exportHref: string | null;
}) {
  const c = t.control.cash;
  const total = (k: "scheduled" | "collected" | "outstanding" | "overdue" | "due30") =>
    projects.reduce((a, p) => a + p[k], 0);
  const scheduled = total("scheduled");
  const agingMax = Math.max(1, ...agingBuckets.map((b) => aging[b]));
  return (
    <Panel
      title={c.title}
      description={c.hint}
      actions={exportHref ? <ExportLink href={exportHref} t={t} /> : null}
    >
      <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
        {(
          [
            ["collected", "text-emerald-700"],
            ["outstanding", "text-ink"],
            ["overdue", "text-red-700"],
            ["due30", "text-amber-700"],
          ] as const
        ).map(([k, tone]) => (
          <div key={k} className="bg-surface px-4 py-2.5">
            <p className="text-2xs text-muted">{c[k]}</p>
            <p className={cn("text-[15px] font-semibold num", tone)}>
              {formatMoneyCompact(locale, total(k))}
            </p>
            {k === "collected" && scheduled ? (
              <p className="text-2xs text-faint">
                {formatPercent(locale, total("collected") / scheduled)} ·{" "}
                {formatMoneyCompact(locale, scheduled)}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <div className="border-t border-line px-4 py-3">
        <p className="mb-1.5 text-2xs font-medium text-muted">{c.aging}</p>
        <ul className="space-y-1">
          {agingBuckets.map((b) => (
            <li key={b} className="grid grid-cols-[80px_1fr_90px] items-center gap-2 text-2xs">
              <span className="text-muted">{c[b]}</span>
              <span className="h-2 overflow-hidden rounded-sm bg-slate-100">
                <span
                  className={cn(
                    "block h-full rounded-sm",
                    b === "d30" ? "bg-amber-400" : b === "d60" ? "bg-orange-500" : "bg-red-600",
                  )}
                  style={{ width: `${(aging[b] / agingMax) * 100}%` }}
                />
              </span>
              <span className="text-right font-medium num">
                {aging[b] ? formatMoneyCompact(locale, aging[b]) : "—"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

/**
 * Budget vs actual vs forecast per project. Actual figures are solid; the forecast column is set
 * apart (tinted, labelled) so nobody mistakes an estimate for money already spent.
 */
export function BudgetPanel({
  t,
  locale,
  appBase,
  projects,
  exportHref,
}: Base & { projects: ProjectRow[]; exportHref: string | null }) {
  const c = t.control.budget;
  const visible = projects.filter((p) => p.cost);
  return (
    <Panel
      title={c.title}
      description={c.hint}
      actions={exportHref && visible.length ? <ExportLink href={exportHref} t={t} /> : null}
    >
      {visible.length ? (
        <Table>
          <THead>
            <tr>
              <TH>{t.projects.title}</TH>
              <TH align="right">{c.baseline}</TH>
              <TH align="right">
                {c.committed} <Badge tone="neutral">{c.actualTag}</Badge>
              </TH>
              <TH align="right">
                {c.actual} <Badge tone="neutral">{c.actualTag}</Badge>
              </TH>
              <TH align="right" className="bg-violet-50/60">
                {c.forecast} <Badge tone="accent">{c.forecastTag}</Badge>
              </TH>
              <TH align="right">{c.variance}</TH>
              <TH align="right">{c.overruns}</TH>
            </tr>
          </THead>
          <tbody>
            {visible.map((p) => {
              const cost = p.cost!;
              return (
                <TR key={p.id}>
                  <TD>
                    <Link
                      href={`${appBase}/projects/${p.id}/procurement?view=cost`}
                      className={link}
                    >
                      {p.code}
                    </Link>
                  </TD>
                  <TD align="right" className="num">
                    {cost.baseline ? formatMoney(locale, cost.baseline, p.currency) : c.noBudget}
                  </TD>
                  <TD align="right" className="num">
                    {formatMoney(locale, cost.committed, p.currency)}
                  </TD>
                  <TD align="right" className="num">
                    {formatMoney(locale, cost.actual, p.currency)}
                  </TD>
                  <TD align="right" className="bg-violet-50/60 text-violet-900 italic num">
                    {formatMoney(locale, cost.forecast, p.currency)}
                  </TD>
                  <TD
                    align="right"
                    className={cn(
                      "num",
                      cost.variance < 0 ? "font-semibold text-red-700" : "text-emerald-700",
                    )}
                  >
                    {formatMoney(locale, cost.variance, p.currency)}
                  </TD>
                  <TD
                    align="right"
                    className={cost.overruns ? "font-semibold text-red-700 num" : "text-faint num"}
                  >
                    {num(cost.overruns)}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <Restricted t={t} />
      )}
      {visible.length && visible.length < projects.length ? (
        <p className="border-t border-line px-4 py-2 text-2xs text-muted">
          <Lock className="mr-1 inline size-3" />
          {projects
            .filter((p) => !p.cost)
            .map((p) => p.code)
            .join(", ")}{" "}
          · {t.control.restricted}
        </p>
      ) : null}
    </Panel>
  );
}

export function HealthPanel({ t, locale, appBase, projects }: Base & { projects: ProjectRow[] }) {
  const c = t.control.construction;
  const pr = t.control.procurement;
  return (
    <Panel title={`${c.title} · ${pr.title}`}>
      <Table>
        <THead>
          <tr>
            <TH>{t.projects.title}</TH>
            <TH className="min-w-44">{c.progress}</TH>
            <TH align="right">{c.late}</TH>
            <TH align="right">{c.defects}</TH>
            <TH align="right">{c.rfis}</TH>
            <TH align="right">{c.si}</TH>
            <TH align="right">{c.handover}</TH>
            <TH align="right">{pr.prPending}</TH>
            <TH align="right">{pr.poPending}</TH>
            <TH align="right">{pr.poOverdue}</TH>
            <TH align="right">{pr.claims}</TH>
          </tr>
        </THead>
        <tbody>
          {projects.map((p) => {
            const b = `${appBase}/projects/${p.id}`;
            const behind = p.planned - p.progress;
            const handed = p.handover.HANDED_OVER ?? 0;
            return (
              <TR key={p.id}>
                <TD>
                  <Link href={b} className={link}>
                    {p.code}
                  </Link>
                  <p className="max-w-40 truncate text-[10px] text-faint">{p.name}</p>
                </TD>
                <TD>
                  {p.units ? (
                    <Link href={`${b}/schedule`} className="block">
                      <Progress value={p.progress} />
                      <p
                        className={cn(
                          "text-[10px] num",
                          behind > 5 ? "text-red-700" : "text-faint",
                        )}
                      >
                        {t.control.kpi.vsPlan} {Math.round(p.planned)}%
                      </p>
                    </Link>
                  ) : (
                    <span className="text-2xs text-faint">{t.control.houses.noSchedule}</span>
                  )}
                </TD>
                <TD
                  align="right"
                  className={p.late ? "font-semibold text-red-700 num" : "text-faint num"}
                >
                  <Link href={`${b}/schedule`}>{num(p.late)}</Link>
                </TD>
                <TD align="right" className="num">
                  <Link href={`${b}/site?view=defects`} className="hover:underline">
                    <span className={p.defects.HIGH ? "font-semibold text-red-700" : "text-faint"}>
                      {p.defects.HIGH}
                    </span>
                    <span className="text-faint"> / </span>
                    <span className={p.defects.MEDIUM ? "text-amber-700" : "text-faint"}>
                      {p.defects.MEDIUM}
                    </span>
                    <span className="text-faint"> / {p.defects.LOW}</span>
                  </Link>
                </TD>
                <TD align="right" className="num">
                  <Link href={`${b}/site?view=rfis`} className="hover:underline">
                    {num(p.rfisOpen)}
                    {p.rfisOverdue ? (
                      <span className="font-semibold text-red-700"> ({p.rfisOverdue})</span>
                    ) : null}
                  </Link>
                </TD>
                <TD align="right" className="num">
                  <Link href={`${b}/site?view=instructions`}>{num(p.siOpen)}</Link>
                </TD>
                <TD align="right" className="num">
                  <Link href={`${b}/handover`}>
                    {handed}/{Object.values(p.handover).reduce((a, n) => a + n, 0) || "—"}
                  </Link>
                </TD>
                <TD align="right" className="num">
                  <Link href={`${b}/procurement?view=requests`}>{num(p.prPending)}</Link>
                </TD>
                <TD align="right" className="num">
                  <Link href={`${b}/procurement?view=orders`}>{num(p.poPending)}</Link>
                </TD>
                <TD
                  align="right"
                  className={p.poOverdue ? "font-semibold text-red-700 num" : "text-faint num"}
                >
                  <Link href={`${b}/procurement?view=orders`}>
                    {p.poOverdue
                      ? `${p.poOverdue} · ${formatMoneyCompact(locale, p.poOverdueAmount)}`
                      : "—"}
                  </Link>
                </TD>
                <TD align="right" className="num">
                  <Link href={`${b}/procurement?view=claims`}>
                    {p.claimsPending
                      ? `${p.claimsPending} · ${formatMoneyCompact(locale, p.claimsAmount)}`
                      : "—"}
                  </Link>
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </Panel>
  );
}

/** One row per house across every project: the "all five houses on one screen" board. */
export function HousesTable({
  t,
  locale,
  appBase,
  houses,
  projectCode,
  exportHref,
  compact = false,
}: Base & {
  houses: HouseRow[];
  projectCode: Map<string, string>;
  exportHref: string | null;
  compact?: boolean;
}) {
  const c = t.control.houses;
  const totals = houses.reduce(
    (a, h) => ({
      scheduled: a.scheduled + h.scheduled,
      collected: a.collected + h.collected,
      overdue: a.overdue + h.overdue,
    }),
    { scheduled: 0, collected: 0, overdue: 0 },
  );
  return (
    <Panel
      title={c.title}
      description={c.hint}
      actions={exportHref ? <ExportLink href={exportHref} t={t} /> : null}
    >
      {houses.length ? (
        <Table>
          <THead>
            <tr>
              <TH>{c.unit}</TH>
              <TH>{t.common.status}</TH>
              <TH>{c.customer}</TH>
              {compact ? null : <TH>{c.contract}</TH>}
              <TH className="min-w-40">{c.progress}</TH>
              <TH align="right">{c.late}</TH>
              <TH align="right">{c.collection}</TH>
              <TH align="right">{c.overdue}</TH>
              <TH align="right">{c.defects}</TH>
              <TH>{c.handover}</TH>
              {compact ? null : <TH align="right">{c.service}</TH>}
            </tr>
          </THead>
          <tbody>
            {houses.map((h) => {
              const p = `${appBase}/projects/${h.projectId}`;
              const behind = h.planned - h.progress;
              return (
                <TR key={h.id}>
                  <TD>
                    <Link href={`${p}/units/${h.id}`} className={link}>
                      {h.code}
                    </Link>
                    <p className="font-mono text-[10px] text-faint">
                      {projectCode.get(h.projectId)}
                    </p>
                  </TD>
                  <TD>
                    <Badge tone={toneOf(h.status)}>{label(t.status.unit, h.status)}</Badge>
                  </TD>
                  <TD className="max-w-36 truncate text-[13px]">{h.customer ?? "—"}</TD>
                  {compact ? null : (
                    <TD>
                      {h.contract ? (
                        <Link
                          href={`${appBase}/sales/contracts/${h.contract.id}`}
                          className="inline-flex items-center gap-1"
                        >
                          <span className="font-mono text-2xs">{h.contract.no}</span>
                          <Badge tone={contractTone[h.contract.status] ?? "neutral"}>
                            {label(t.status.contract, h.contract.status)}
                          </Badge>
                        </Link>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </TD>
                  )}
                  <TD>
                    {h.hasSchedule ? (
                      <Link href={`${p}/units/${h.id}/schedule`} className="block">
                        <Progress value={h.progress} />
                        <p
                          className={cn(
                            "text-[10px] num",
                            behind > 5 ? "text-red-700" : "text-faint",
                          )}
                        >
                          {t.control.kpi.vsPlan} {Math.round(h.planned)}%
                        </p>
                      </Link>
                    ) : (
                      <span className="text-2xs text-faint">{c.noSchedule}</span>
                    )}
                  </TD>
                  <TD
                    align="right"
                    className={h.late ? "font-semibold text-red-700 num" : "text-faint num"}
                  >
                    {num(h.late)}
                  </TD>
                  <TD align="right" className="num">
                    <Link href={`${p}/units/${h.id}/payments`} className="hover:underline">
                      {h.scheduled ? (
                        <>
                          {formatMoneyCompact(locale, h.collected)}
                          <span className="block text-[10px] text-faint">
                            {formatPercent(locale, h.collected / h.scheduled)}
                          </span>
                        </>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </Link>
                  </TD>
                  <TD
                    align="right"
                    className={h.overdue ? "font-semibold text-red-700 num" : "text-faint num"}
                  >
                    {h.overdue ? formatMoneyCompact(locale, h.overdue) : "—"}
                  </TD>
                  <TD align="right" className="num">
                    <Link href={`${p}/site?view=defects`} className="hover:underline">
                      {h.openDefects ? (
                        <>
                          {h.openDefects}
                          {h.highDefects ? (
                            <span className="font-semibold text-red-700"> ({h.highDefects}!)</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </Link>
                  </TD>
                  <TD>
                    {h.handover ? (
                      <Link href={`${p}/handover/${h.id}`}>
                        <Badge tone={handoverTone[h.handover] ?? "neutral"}>
                          {label(t.status.handover, h.handover)}
                        </Badge>
                      </Link>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </TD>
                  {compact ? null : (
                    <TD
                      align="right"
                      className={h.openService ? "text-amber-700 num" : "text-faint num"}
                    >
                      {num(h.openService)}
                    </TD>
                  )}
                </TR>
              );
            })}
          </tbody>
          <TFoot>
            <tr>
              <TD colSpan={compact ? 5 : 6} className="font-medium">
                {formatNumber(locale, houses.length)} {c.unit}
              </TD>
              <TD align="right" className="font-semibold num">
                {formatMoneyCompact(locale, totals.collected)}
              </TD>
              <TD align="right" className="font-semibold text-red-700 num">
                {totals.overdue ? formatMoneyCompact(locale, totals.overdue) : "—"}
              </TD>
              <TD colSpan={compact ? 2 : 3} />
            </tr>
          </TFoot>
        </Table>
      ) : (
        <EmptyState title={c.empty} />
      )}
    </Panel>
  );
}

export function ApprovalsList({
  t,
  locale,
  items,
  projectCode,
  unitCode,
  limit,
  moreHref,
  exportHref,
}: Base & {
  items: ApprovalItem[];
  projectCode: Map<string, string>;
  unitCode: Map<string, string>;
  limit?: number;
  moreHref?: string;
  exportHref?: string | null;
}) {
  const c = t.control.approvals;
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <Panel
      title={c.title}
      actions={
        <>
          {exportHref ? <ExportLink href={exportHref} t={t} /> : null}
          <Badge tone={items.length ? "warning" : "neutral"}>{items.length}</Badge>
        </>
      }
    >
      {shown.length ? (
        <ul className="divide-y divide-line">
          {shown.map((a) => (
            <li key={a.key}>
              <Link href={a.href} className="flex items-center gap-3 px-4 py-2 hover:bg-subtle">
                <FileClock className="size-4 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">
                    <span className="text-muted">{c.kinds[a.kind]}</span> ·{" "}
                    <span className="font-mono text-2xs">{a.ref}</span>
                    {a.kind === "financeDoc" ? (
                      <span> {label(t.status.documentType, a.title)}</span>
                    ) : a.title ? (
                      <span> {a.title}</span>
                    ) : null}
                  </p>
                  <p className="text-2xs text-muted">
                    {projectCode.get(a.projectId)}
                    {a.unitId && unitCode.get(a.unitId) && unitCode.get(a.unitId) !== a.ref
                      ? ` · ${unitCode.get(a.unitId)}`
                      : ""}
                    {a.since ? ` · ${c.since} ${formatDate(locale, a.since)}` : ""}
                  </p>
                </div>
                {a.amount ? (
                  <span className="text-[13px] font-semibold num">
                    {formatMoneyCompact(locale, a.amount)}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-center text-2xs text-muted">{c.empty}</p>
      )}
      {moreHref && limit && items.length > limit ? (
        <Link
          href={moreHref}
          className="block border-t border-line px-4 py-2 text-center text-2xs font-medium text-brand hover:bg-subtle"
        >
          {t.control.timeline.more} ({items.length - limit})
        </Link>
      ) : null}
    </Panel>
  );
}

export function IssuesList({
  t,
  locale,
  items,
  projectCode,
  unitCode,
  limit,
  moreHref,
  exportHref,
}: Base & {
  items: IssueItem[];
  projectCode: Map<string, string>;
  unitCode: Map<string, string>;
  limit?: number;
  moreHref?: string;
  exportHref?: string | null;
}) {
  const c = t.control.issues;
  const shown = limit ? items.slice(0, limit) : items;
  const critical = items.filter((i) => i.critical).length;
  return (
    <Panel
      title={c.title}
      actions={
        <>
          {exportHref ? <ExportLink href={exportHref} t={t} /> : null}
          <Badge tone={critical ? "danger" : "neutral"}>{critical}</Badge>
        </>
      }
    >
      {shown.length ? (
        <ul className="divide-y divide-line">
          {shown.map((i) => (
            <li key={i.key}>
              <Link href={i.href} className="flex items-center gap-3 px-4 py-2 hover:bg-subtle">
                {i.critical ? (
                  <AlertTriangle className="size-4 shrink-0 text-red-600" />
                ) : (
                  <Clock className="size-4 shrink-0 text-amber-500" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">
                    <span className={i.critical ? "text-red-700" : "text-muted"}>
                      {c.kinds[i.kind]}
                    </span>{" "}
                    · <span className="font-mono text-2xs">{i.ref}</span>{" "}
                    {i.kind === "overrun"
                      ? c.overrun.replace("{n}", i.title)
                      : locale === "th" && i.titleTh
                        ? i.titleTh
                        : i.title}
                  </p>
                  <p className="text-2xs text-muted">
                    {projectCode.get(i.projectId)}
                    {i.unitId && unitCode.get(i.unitId) && i.ref !== unitCode.get(i.unitId)
                      ? ` · ${unitCode.get(i.unitId)}`
                      : ""}
                    {i.due ? ` · ${formatDate(locale, i.due)}` : ""}
                    {i.daysOver ? (
                      <span className="text-red-700">
                        {" "}
                        · {c.daysOver.replace("{n}", String(i.daysOver))}
                      </span>
                    ) : null}
                  </p>
                </div>
                {i.amount ? (
                  <span className="text-[13px] font-semibold num">
                    {formatMoneyCompact(locale, i.amount)}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-center text-2xs text-muted">{c.empty}</p>
      )}
      {moreHref && limit && items.length > limit ? (
        <Link
          href={moreHref}
          className="block border-t border-line px-4 py-2 text-center text-2xs font-medium text-brand hover:bg-subtle"
        >
          {t.control.timeline.more} ({items.length - limit})
        </Link>
      ) : null}
    </Panel>
  );
}

export function TimelineList({
  t,
  locale,
  appBase,
  events,
  projectCode,
  unitCode,
}: Base & {
  events: TimelineEvent[];
  projectCode?: Map<string, string>;
  unitCode?: Map<string, string>;
}) {
  if (!events.length)
    return <p className="px-4 py-6 text-center text-2xs text-muted">{t.control.timeline.empty}</p>;
  return (
    <ol className="divide-y divide-line">
      {events.map((e) => {
        const href = timelineHref(appBase, e);
        const body = (
          <>
            <span className="w-32 shrink-0 text-2xs text-muted num">
              {formatDateTime(locale, e.created_at)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{e.title}</span>
              <span className="text-2xs text-muted">
                {label(t.status.timelineEvent, e.event_type)}
                {e.project_id && projectCode?.get(e.project_id)
                  ? ` · ${projectCode.get(e.project_id)}`
                  : ""}
                {e.unit_id && unitCode?.get(e.unit_id) ? ` · ${unitCode.get(e.unit_id)}` : ""}
              </span>
            </span>
          </>
        );
        return (
          <li key={e.id}>
            {href ? (
              <Link href={href} className="flex items-start gap-3 px-4 py-2 hover:bg-subtle">
                {body}
              </Link>
            ) : (
              <div className="flex items-start gap-3 px-4 py-2">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
