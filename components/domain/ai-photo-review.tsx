import { AlertTriangle, CheckCircle2, HelpCircle, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Hidden } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";

export type PhotoReviewRow = {
  verdict: string;
  estimated_percent: number | string | null;
  summary_th: string;
  summary_en: string;
  concerns: string[];
  photo_count: number;
  created_at: string;
};

type Labels = {
  title: string;
  run: string;
  rerun: string;
  hint: string;
  estimated: string;
  advisory: string;
  verdict: Record<string, string>;
};

const tone = { CONSISTENT: "success", QUESTIONABLE: "danger", INSUFFICIENT: "warning" } as const;
const icon = { CONSISTENT: CheckCircle2, QUESTIONABLE: AlertTriangle, INSUFFICIENT: HelpCircle };

/** AI second opinion on progress photos, shown to verifiers next to the verify form. */
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
        <div className="mt-2 space-y-1.5">
          {review.estimated_percent != null ? (
            <p className="text-2xs text-muted">
              {labels.estimated}:{" "}
              <span className="font-semibold text-ink num">
                {Number(review.estimated_percent)}%
              </span>
              {" · "}
              {review.photo_count} 📷 · {formatDateTime(locale, review.created_at)}
            </p>
          ) : null}
          <p className="[overflow-wrap:anywhere]">
            {locale === "th" ? review.summary_th : review.summary_en}
          </p>
          {review.concerns.length ? (
            <ul className="list-disc space-y-0.5 pl-5 text-2xs text-red-800 [overflow-wrap:anywhere]">
              {review.concerns.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="mt-1 text-2xs text-muted">{labels.hint}</p>
      )}
      <p className="mt-2 text-[10px] text-faint">{labels.advisory}</p>
    </div>
  );
}
