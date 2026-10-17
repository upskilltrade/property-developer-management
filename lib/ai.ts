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

const PhotoReview = z.object({
  verdict: z.enum(["CONSISTENT", "QUESTIONABLE", "INSUFFICIENT"]),
  estimated_percent: z.number().nullable(),
  summary_th: z.string(),
  summary_en: z.string(),
  concerns: z.array(z.string()),
});
export type PhotoReviewResult = z.infer<typeof PhotoReview>;

const PHOTO_PROMPT = `You review construction site photos for a Thai house builder. A site engineer has reported a completion percent for one schedule activity and attached photos. Give the verifying engineer a second opinion; they make the decision.

Judge only what the photos show:
- CONSISTENT: the photos plausibly show work at roughly the reported percent.
- QUESTIONABLE: the photos suggest noticeably less (or different) work than reported, or show quality or safety problems worth checking.
- INSUFFICIENT: the photos are too few, unclear, or don't show this activity well enough to judge.

estimated_percent is your own estimate of completion for this activity from the photos, or null if you can't tell. Write summary_th in Thai and summary_en in English (2-3 sentences each, plain language). List concrete concerns in Thai (for example a visible defect, missing work, or a photo that seems to show a different location); return an empty list if there are none. Never claim certainty you don't have.`;

export async function reviewProgressPhotos(input: {
  activity: string;
  stage: string;
  reportedPercent: number;
  previousVerified: number;
  note: string | null;
  images: AiImage[];
}) {
  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    system: PHOTO_PROMPT,
    output_config: { effort: "medium", format: betaZodOutputFormat(PhotoReview) },
    ...AI_FALLBACK,
    messages: [
      {
        role: "user",
        content: [
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
            ].join("\n"),
          },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) throw new AiRefusalError();
  const review = response.parsed_output;
  const est = review.estimated_percent;
  return {
    review: {
      ...review,
      estimated_percent: est == null ? null : Math.max(0, Math.min(100, Math.round(est))),
      concerns: review.concerns.slice(0, 8),
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
