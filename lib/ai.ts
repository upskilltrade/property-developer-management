import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export const AI_MODEL = "claude-opus-5-5";
/** Server-side refusal fallback: a declined request is retried on a suitable model in-call. */
export const AI_FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

export class AiRefusalError extends Error {}

/** Maps an SDK error to a short key the UI can translate. */
export function aiErrorKey(e: unknown) {
  if (e instanceof AiRefusalError) return "refusal";
  if (e instanceof Anthropic.AuthenticationError) return "auth";
  if (e instanceof Anthropic.RateLimitError) return "rate_limit";
  if (e instanceof Anthropic.APIError) return "generic";
  return "generic";
}

export type AiImage = {
  media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  data: string;
};
export const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// ---------------------------------------------------------------- site photo review

const Finding = z.object({
  basis: z.enum(["SPEC", "TECHNICAL"]),
  requirement: z.string(),
  document_code: z.string(),
  clause: z.string(),
  observation: z.string(),
  result: z.enum(["PASS", "FAIL", "UNCLEAR"]),
});
const PhotoReview = z.object({
  verdict: z.enum(["CONSISTENT", "QUESTIONABLE", "INSUFFICIENT"]),
  estimated_percent: z.number().nullable(),
  spec_verdict: z.enum(["PASS", "FAIL", "NOT_ASSESSABLE"]),
  technical_verdict: z.enum(["PASS", "FAIL", "NOT_ASSESSABLE"]),
  findings: z.array(Finding),
  summary_th: z.string(),
  summary_en: z.string(),
  concerns: z.array(z.string()),
});
export type PhotoReviewResult = z.infer<typeof PhotoReview>;
export type ReviewFinding = z.infer<typeof Finding> & { reference_ok: boolean };

const PHOTO_PROMPT = `You review construction site photos for a Thai house builder. A site engineer has reported a completion percent for one schedule activity and attached photos. Give the verifying engineer a second opinion; they make the decision.

You are given the project's verified documents for this kind of work, each introduced by a line "DOCUMENT <code> · <type> · <title>":
- PROJECT_SPEC (รายการประกอบแบบ) and CONTRACT documents: what this project must build.
- STANDARD documents: technical and good-practice standards the work must meet.

Assess in two parts:
1. SPEC: does the visible work match the project specification and contract (materials, sizes, spacing, layout, workmanship requirements)?
2. TECHNICAL: is the visible work done correctly by engineering principles and the attached standards?

Rules — these are strict:
- Every finding must cite a document given here: document_code exactly as written after "DOCUMENT", and clause as the clause, table or page number where the requirement appears. Never cite a standard, clause or number from memory, and never cite a document that was not provided.
- If no provided document covers something, do not make a finding about it; you may mention it in concerns as "ไม่มีเอกสารอ้างอิง".
- result is PASS when the photos show the requirement is met, FAIL when they show it is not, UNCLEAR when the photos can't show it.
- spec_verdict / technical_verdict: FAIL if any finding of that basis failed, PASS if there are findings and all passed, NOT_ASSESSABLE if no documents of that basis were provided or nothing could be judged from the photos.
- verdict: CONSISTENT when the photos plausibly show work at roughly the reported percent and nothing failed; QUESTIONABLE when progress looks overstated or a finding failed; INSUFFICIENT when the photos can't support a judgement.
- estimated_percent: your own estimate from the photos, or null.
- Write requirement, observation and concerns in Thai. summary_th in Thai and summary_en in English, 2-3 sentences each, naming the documents relied on. Never claim certainty you don't have.`;

export type ReviewDocument = {
  code: string;
  title: string;
  docType: string;
  media_type: "application/pdf";
  data: string;
};

export async function reviewProgressPhotos(input: {
  activity: string;
  stage: string;
  reportedPercent: number;
  previousVerified: number;
  note: string | null;
  images: AiImage[];
  documents: ReviewDocument[];
}) {
  const client = new Anthropic();
  // Documents first (cacheable across reviews of the same project), then photos and the report.
  const docBlocks = input.documents.flatMap((d, i) => [
    { type: "text" as const, text: `DOCUMENT ${d.code} · ${d.docType} · ${d.title}` },
    {
      type: "document" as const,
      source: { type: "base64" as const, media_type: d.media_type, data: d.data },
      title: d.code,
      ...(i === input.documents.length - 1
        ? { cache_control: { type: "ephemeral" as const } }
        : {}),
    },
  ]);
  const response = await client.beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    system: PHOTO_PROMPT,
    output_config: { effort: "high", format: betaZodOutputFormat(PhotoReview) },
    ...AI_FALLBACK,
    messages: [
      {
        role: "user",
        content: [
          ...docBlocks,
          ...input.images.map((img) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: img.media_type, data: img.data },
          })),
          {
            type: "text",
            text: [
              `Activity: ${input.activity} (stage: ${input.stage})`,
              `Previously verified: ${input.previousVerified}%`,
              `Reported now: ${input.reportedPercent}%`,
              `Site note: ${input.note || "(none)"}`,
              `Photos attached: ${input.images.length}`,
              `Documents provided: ${input.documents.map((d) => `${d.code} (${d.docType})`).join(", ") || "none"}`,
            ].join("\n"),
          },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) throw new AiRefusalError();
  const review = response.parsed_output;
  const est = review.estimated_percent;
  // A finding counts only if it cites a document we actually sent; anything else is flagged.
  const provided = new Map(input.documents.map((d) => [d.code.trim(), d.docType]));
  const findings: ReviewFinding[] = review.findings.slice(0, 30).map((f) => ({
    ...f,
    reference_ok: provided.has(f.document_code.trim()) && f.clause.trim().length > 0,
  }));
  // Verdicts are recomputed from the findings that cite a provided document.
  const basisVerdict = (basis: "SPEC" | "TECHNICAL") => {
    const types = basis === "SPEC" ? ["PROJECT_SPEC", "CONTRACT"] : ["STANDARD"];
    if (![...provided.values()].some((t) => types.includes(t))) return "NOT_ASSESSABLE" as const;
    const valid = findings.filter((f) => f.basis === basis && f.reference_ok);
    if (valid.some((f) => f.result === "FAIL")) return "FAIL" as const;
    return valid.some((f) => f.result === "PASS") ? ("PASS" as const) : ("NOT_ASSESSABLE" as const);
  };
  const specVerdict = basisVerdict("SPEC");
  const technicalVerdict = basisVerdict("TECHNICAL");
  const verdict =
    review.verdict === "CONSISTENT" && (specVerdict === "FAIL" || technicalVerdict === "FAIL")
      ? "QUESTIONABLE"
      : review.verdict;
  return {
    review: {
      ...review,
      verdict,
      estimated_percent: est == null ? null : Math.max(0, Math.min(100, Math.round(est))),
      concerns: review.concerns.slice(0, 8),
      findings,
      spec_verdict: specVerdict,
      technical_verdict: technicalVerdict,
    },
    usage: response.usage,
  };
}

// ---------------------------------------------------------------- supplier quotation extraction

const Quotation = z.object({
  supplier_name: z.string().nullable(),
  supplier_tax_id: z.string().nullable(),
  quote_ref: z.string().nullable(),
  quote_date: z.string().nullable(),
  valid_until: z.string().nullable(),
  lead_time_days: z.number().nullable(),
  subtotal: z.number().nullable(),
  vat_amount: z.number().nullable(),
  total_amount: z.number().nullable(),
  currency: z.string().nullable(),
  line_items: z.array(
    z.object({
      description: z.string(),
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
      unit_price: z.number().nullable(),
      amount: z.number().nullable(),
    }),
  ),
  notes: z.string().nullable(),
});
export type QuotationResult = z.infer<typeof Quotation>;

const QUOTE_PROMPT = `You extract data from a supplier quotation (ใบเสนอราคา) for a Thai construction company. Copy values exactly as printed; use null for anything not present rather than guessing.

- Dates as YYYY-MM-DD. Convert Buddhist-era years (พ.ศ., e.g. 2569) to Gregorian (subtract 543).
- valid_until: the expiry date, or quote_date plus the stated validity period (ยืนราคา N วัน) when only that is given.
- lead_time_days: delivery time in days if stated (convert weeks to days).
- total_amount is the grand total the buyer pays (รวมทั้งสิ้น / Grand total), including VAT when VAT is charged.
- Amounts are plain numbers without separators or currency symbols. currency defaults to THB only when the document is clearly Thai baht.
- notes: payment terms, delivery terms or conditions worth knowing, in the document's language, briefly.`;

export const quoteDocTypes = new Set(["application/pdf", ...imageTypes]);

export async function extractQuotation(file: { media_type: string; data: string }) {
  const client = new Anthropic();
  const block =
    file.media_type === "application/pdf"
      ? {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: file.data,
          },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: file.media_type as AiImage["media_type"],
            data: file.data,
          },
        };
  const response = await client.beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    system: QUOTE_PROMPT,
    output_config: { effort: "low", format: betaZodOutputFormat(Quotation) },
    ...AI_FALLBACK,
    messages: [
      {
        role: "user",
        content: [block, { type: "text", text: "Extract this quotation." }],
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) throw new AiRefusalError();
  return { quote: response.parsed_output, usage: response.usage };
}
