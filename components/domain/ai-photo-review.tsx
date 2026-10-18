import { AlertTriangle, CheckCircle2, FileText, HelpCircle, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Hidden } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/components/ui/cn";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";

type Finding = {
  basis: "SPEC" | "TECHNICAL";
  requirement: string;
  document_code: string;
  clause: string;
  observation: string;
  result: "PASS" | "FAIL" | "UNCLEAR";
  reference_ok: boolean;
};

export type PhotoReviewRow = {
  verdict: string;
  estimated_percent: number | string | null;
  summary_th: string;
  summary_en: string;
  concerns: string[];
  photo_count: number;
  created_at: string;
  spec_verdict?: string | null;
  technical_verdict?: string | null;
  findings?: Finding[] | null;
  documents?: { code: string; title: string; doc_type: string }[] | null;
};

type Labels = {
  title: string;
  run: string;
  rerun: string;
  hint: string;
  estimated: string;
  advisory: string;
  verdict: Record<string, string>;
  specCheck: string;
  technicalCheck: string;
  basisVerdict: Record<string, string>;
  result: Record<string, string>;
  documentsUsed: string;
  noDocuments: string;
  unverifiedReference: string;
  requirement: string;
  observation: string;
};

const tone = { CONSISTENT: "success", QUESTIONABLE: "danger", INSUFFICIENT: "warning" } as const;
const icon = { CONSISTENT: CheckCircle2, QUESTIONABLE: AlertTriangle, INSUFFICIENT: HelpCircle };
const basisTone = { PASS: "success", FAIL: "danger", NOT_ASSESSABLE: "neutral" } as const;
const resultTone = { PASS: "success", FAIL: "danger", UNCLEAR: "warning" } as const;

/**
 * AI second opinion on progress photos, shown to verifiers next to the verify form. Findings are
 * split into the project's specification / contract and technical standards, each citing the
 * document it relies on; citations that don't match a provided document are flagged.
 */
export function AiPhotoReview({
  locale,
  review,
  labels,
  action,
  hidden,
  canRun,
}: {
  locale: Locale;
  review: PhotoReviewRow | null;
  labels: Labels;
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  canRun: boolean;
}) {
  const v = (review?.verdict ?? "INSUFFICIENT") as keyof typeof tone;
  const Icon = icon[v] ?? HelpCircle;
  const findings = review?.findings ?? [];
  const section = (basis: "SPEC" | "TECHNICAL", title: string, verdict?: string | null) => {
    const rows = findings.filter((f) => f.basis === basis);
    const bv = (verdict ?? "NOT_ASSESSABLE") as keyof typeof basisTone;
    return (
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-2xs font-medium text-ink-2">
          {title}
          <Badge tone={basisTone[bv] ?? "neutral"}>{labels.basisVerdict[bv] ?? bv}</Badge>
        </p>
        {rows.length ? (
          <ul className="space-y-1">
            {rows.map((f, i) => (
              <li
                key={i}
                className={cn(
                  "rounded border px-2 py-1 text-2xs [overflow-wrap:anywhere]",
                  f.reference_ok ? "border-line bg-surface" : "border-amber-300 bg-amber-50",
                )}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={resultTone[f.result] ?? "neutral"}>
                    {labels.result[f.result] ?? f.result}
                  </Badge>
                  <span className="font-medium text-ink">{f.requirement}</span>
                </div>
                <p className="text-muted">
                  {labels.observation}: {f.observation}
                </p>
                <p className={f.reference_ok ? "text-ink-2" : "text-amber-800"}>
                  <FileText className="mr-0.5 inline size-3" />
                  {f.document_code} · {f.clause}
                  {f.reference_ok ? "" : ` — ${labels.unverifiedReference}`}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  };
  return (
    <div className="min-w-0 rounded-md border border-violet-200 bg-violet-50/50 p-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 text-violet-600" />
        <span className="font-medium">{labels.title}</span>
        {review ? (
          <Badge tone={tone[v] ?? "neutral"}>
            <Icon className="size-3" />
            {labels.verdict[v] ?? v}
          </Badge>
        ) : null}
        {canRun ? (
          <form action={action} className="ml-auto">
            <Hidden values={hidden} />
            <SubmitButton size="xs" variant="secondary">
              {review ? labels.rerun : labels.run}
            </SubmitButton>
          </form>
        ) : null}
      </div>
      {review ? (
        <div className="mt-2 space-y-2">
          <p className="text-2xs text-muted">
            {review.estimated_percent != null ? (
              <>
                {labels.estimated}:{" "}
                <span className="font-semibold text-ink num">
                  {Number(review.estimated_percent)}%
                </span>
                {" · "}
              </>
            ) : null}
            {review.photo_count} 📷 · {formatDateTime(locale, review.created_at)}
          </p>
          <p className="[overflow-wrap:anywhere]">
            {locale === "th" ? review.summary_th : review.summary_en}
          </p>
          {review.spec_verdict || review.technical_verdict || findings.length ? (
            <>
              {section("SPEC", labels.specCheck, review.spec_verdict)}
              {section("TECHNICAL", labels.technicalCheck, review.technical_verdict)}
            </>
          ) : null}
          {review.concerns.length ? (
            <ul className="list-disc space-y-0.5 pl-5 text-2xs text-red-800 [overflow-wrap:anywhere]">
              {review.concerns.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-2xs text-muted">
            {labels.documentsUsed}:{" "}
            {review.documents?.length
              ? review.documents.map((d) => d.code).join(", ")
              : labels.noDocuments}
          </p>
        </div>
      ) : (
        <p className="mt-1 text-2xs text-muted">{labels.hint}</p>
      )}
      <p className="mt-2 text-[10px] text-faint">{labels.advisory}</p>
    </div>
  );
}
