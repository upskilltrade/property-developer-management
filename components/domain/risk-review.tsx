import Link from "next/link";
import { ShieldAlert, Sparkles } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries/th";
import type { Locale } from "@/lib/i18n/config";
import { label } from "@/lib/i18n/label";
import { formatDateTime } from "@/lib/format";
import type { Risk } from "@/lib/risk-review";
import type { Tone } from "@/lib/status";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Hidden } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/components/ui/cn";

export type RiskReviewRow = {
  id: string;
  summary_th: string;
  summary_en: string;
  risks: Risk[];
  discarded: number;
  record_count: number;
  created_at: string;
  creator: { display_name: string | null } | null;
};

const severityTone: Record<string, Tone> = { HIGH: "danger", MEDIUM: "warning", LOW: "info" };

/** AI risk reviews: run one, read the latest, open earlier ones. Every risk links its records. */
export function RiskReviewPanel({
  reviews,
  selectedId,
  locale,
  project,
  hrefFor,
  action,
  configured,
  t,
}: {
  reviews: RiskReviewRow[];
  selectedId?: string;
  locale: Locale;
  project: string | null;
  hrefFor: (reviewId: string) => string;
  action: (fd: FormData) => Promise<void>;
  configured: boolean;
  t: Dictionary;
}) {
  const r = t.riskReview;
  const th = locale === "th";
  const current = reviews.find((x) => x.id === selectedId) ?? reviews[0];

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
      <Panel
        title={r.title}
        description={
          current
            ? `${formatDateTime(locale, current.created_at)} · ${current.creator?.display_name ?? ""}`
            : r.subtitle
        }
        actions={
          <form action={action}>
            <Hidden values={{ locale, project: project ?? "" }} />
            <SubmitButton
              size="sm"
              disabled={!configured}
              title={configured ? undefined : r.notConfigured}
            >
              <Sparkles />
              {r.run}
            </SubmitButton>
          </form>
        }
      >
        {!configured ? (
          <p className="border-b border-line bg-amber-50 px-4 py-2 text-2xs text-amber-800">
            {r.notConfigured}
          </p>
        ) : null}
        {current ? (
          <div className="space-y-3 p-4">
            <p className="text-[13px] leading-relaxed">
              {th ? current.summary_th : current.summary_en}
            </p>
            {current.risks.length ? (
              <ol className="space-y-3">
                {current.risks.map((x, i) => (
                  <li key={i} className="rounded-lg border border-line p-3 text-[13px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={severityTone[x.severity] ?? "neutral"}>
                        {label(r.severity, x.severity)}
                      </Badge>
                      <Badge>{label(r.categories, x.category)}</Badge>
                      <span className="font-semibold">{th ? x.title_th : x.title_en}</span>
                    </div>
                    <p className="mt-1.5 text-ink-2">{th ? x.explanation_th : x.explanation_en}</p>
                    <p className="mt-1.5 rounded bg-subtle px-2 py-1 text-2xs">
                      <span className="font-medium">{r.action}:</span>{" "}
                      {th ? x.action_th : x.action_en}
                      <span className="text-muted"> · {x.owner_role}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1 text-2xs">
                      <span className="text-muted">{r.evidence}:</span>
                      {x.evidence.map((e) => (
                        <Link
                          key={e.id}
                          href={e.link}
                          className="rounded border border-line px-1.5 py-0.5 font-mono text-brand hover:bg-subtle"
                        >
                          {e.label}
                        </Link>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[13px] text-muted">{r.none}</p>
            )}
            <p className="text-[10px] text-faint">
              {r.basis.replace("{n}", String(current.record_count))}
              {current.discarded
                ? ` · ${r.discarded.replace("{n}", String(current.discarded))}`
                : ""}
            </p>
          </div>
        ) : (
          <EmptyState icon={<ShieldAlert />} title={r.empty} body={r.emptyBody} />
        )}
      </Panel>

      <Panel title={r.history}>
        {reviews.length ? (
          <ul className="divide-y divide-line">
            {reviews.map((x) => {
              const high = x.risks.filter((y) => y.severity === "HIGH").length;
              return (
                <li key={x.id}>
                  <Link
                    href={hrefFor(x.id)}
                    className={cn(
                      "block px-4 py-2 text-2xs hover:bg-subtle",
                      x.id === current?.id && "bg-brand-soft/40",
                    )}
                  >
                    <p className="font-medium text-ink">{formatDateTime(locale, x.created_at)}</p>
                    <p className="text-muted">
                      {r.count.replace("{n}", String(x.risks.length))}
                      {high ? ` · ${r.highCount.replace("{n}", String(high))}` : ""}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title={r.noHistory} />
        )}
      </Panel>
    </div>
  );
}
