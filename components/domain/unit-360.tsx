import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  ClipboardCheck,
  FileSignature,
  GitPullRequestArrow,
  HardHat,
  KeyRound,
  Palette,
  Wallet,
} from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries/th";
import type { Locale } from "@/lib/i18n/config";
import { label } from "@/lib/i18n/label";
import { formatMoneyCompact, formatPercent } from "@/lib/format";
import { contractTone } from "@/lib/sales";
import { handoverTone } from "@/lib/handover";
import type { TimelineEvent } from "@/lib/control";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { TimelineList } from "@/components/domain/control-panels";

export type Unit360Data = {
  contract: { id: string; no: string; status: string } | null;
  scheduled: number;
  collected: number;
  overdue: number;
  selectionsPending: number;
  selectionsApproved: number;
  voOpen: number;
  voApproved: number;
  voOffered: number;
  defectsOpen: number;
  defectsHigh: number;
  rfisOpen: number;
  handover: string | null;
  warranties: number;
  serviceOpen: number;
  events: TimelineEvent[];
};

function Card({
  icon,
  title,
  href,
  children,
}: {
  icon: ReactNode;
  title: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-lg border border-line bg-surface p-3 shadow-xs transition-colors hover:border-brand/40 hover:bg-subtle"
    >
      <p className="mb-1.5 flex items-center gap-1.5 text-2xs font-medium tracking-wide text-muted uppercase [&_svg]:size-3.5">
        {icon}
        <span className="flex-1">{title}</span>
        <ArrowUpRight className="opacity-0 transition-opacity group-hover:opacity-100" />
      </p>
      <div className="space-y-0.5 text-[13px]">{children}</div>
    </Link>
  );
}

function Line({ label: l, value, danger }: { label: string; value: ReactNode; danger?: boolean }) {
  return (
    <p className="flex items-center justify-between gap-2">
      <span className="text-muted">{l}</span>
      <span className={danger ? "font-semibold text-red-700 num" : "font-medium num"}>{value}</span>
    </p>
  );
}

/** Every module's state for one unit, each card linking to the module that owns the records. */
export function Unit360Panel({
  t,
  locale,
  projectId,
  unitId,
  data,
  unitCode,
}: {
  t: Pick<Dictionary, "unit360" | "control" | "status" | "common" | "projects">;
  locale: Locale;
  projectId: string;
  unitId: string;
  data: Unit360Data;
  unitCode: string;
}) {
  const u = t.unit360;
  const appBase = `/${locale}/app`;
  const p = `${appBase}/projects/${projectId}`;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card
          icon={<FileSignature />}
          title={u.sales}
          href={
            data.contract
              ? `${appBase}/sales/contracts/${data.contract.id}`
              : `${appBase}/sales/bookings`
          }
        >
          {data.contract ? (
            <p className="flex items-center gap-2">
              <span className="font-mono text-2xs">{data.contract.no}</span>
              <Badge tone={contractTone[data.contract.status] ?? "neutral"}>
                {label(t.status.contract, data.contract.status)}
              </Badge>
            </p>
          ) : (
            <p className="text-faint">{u.noContract}</p>
          )}
        </Card>
        <Card icon={<Wallet />} title={u.payments} href={`${p}/units/${unitId}/payments`}>
          <Line
            label={u.collected}
            value={
              data.scheduled
                ? `${formatMoneyCompact(locale, data.collected)} (${formatPercent(locale, data.collected / data.scheduled)})`
                : "—"
            }
          />
          <Line
            label={u.overdue}
            value={data.overdue ? formatMoneyCompact(locale, data.overdue) : "—"}
            danger={data.overdue > 0}
          />
        </Card>
        <Card icon={<Palette />} title={u.design} href={`${p}/design`}>
          <Line label={u.pendingApprovals} value={data.selectionsPending || "—"} />
          <Line label={u.released} value={data.selectionsApproved || "—"} />
        </Card>
        <Card icon={<GitPullRequestArrow />} title={u.changes} href={`${p}/changes`}>
          <Line label={u.openVo} value={data.voOpen || "—"} />
          <Line label={u.pendingApprovals} value={data.voOffered || "—"} />
          <Line label={u.approvedVo} value={data.voApproved || "—"} />
        </Card>
        <Card icon={<HardHat />} title={u.site} href={`${p}/site?view=defects`}>
          <Line
            label={u.openDefects}
            value={
              data.defectsOpen
                ? `${data.defectsOpen}${data.defectsHigh ? ` (${data.defectsHigh} HIGH)` : ""}`
                : "—"
            }
            danger={data.defectsHigh > 0}
          />
          <Line label={u.openRfis} value={data.rfisOpen || "—"} />
        </Card>
        <Card icon={<KeyRound />} title={u.handover} href={`${p}/handover/${unitId}`}>
          <p>
            {data.handover ? (
              <Badge tone={handoverTone[data.handover] ?? "neutral"}>
                {label(t.status.handover, data.handover)}
              </Badge>
            ) : (
              <span className="text-faint">—</span>
            )}
          </p>
          <Line label={u.warranties} value={data.warranties || "—"} />
          <Line label={u.openService} value={data.serviceOpen || "—"} />
        </Card>
      </div>
      <Panel
        title={
          <span className="flex items-center gap-1.5">
            <ClipboardCheck className="size-4 text-muted" />
            {u.timeline}
          </span>
        }
      >
        <TimelineList
          t={t}
          locale={locale}
          appBase={appBase}
          events={data.events}
          unitCode={new Map([[unitId, unitCode]])}
        />
      </Panel>
    </div>
  );
}
