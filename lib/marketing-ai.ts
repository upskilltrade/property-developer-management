import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { AI_FALLBACK, AI_MODEL, AiRefusalError, AiTooLongError } from "@/lib/ai";
import { channels, copyFormats, copyLanguages } from "@/lib/marketing";

const Draft = z.object({
  concept: z.object({
    big_idea: z.string(),
    insight: z.string(),
    angles: z.array(z.string()),
    key_visual: z.string(),
    hashtags: z.array(z.string()),
  }),
  copies: z.array(
    z.object({
      channel: z.enum(channels),
      format: z.enum(copyFormats),
      language: z.enum(copyLanguages),
      headline: z.string().nullable(),
      body: z.string(),
      cta: z.string().nullable(),
      hashtags: z.string().nullable(),
      visual_idea: z.string().nullable(),
    }),
  ),
});
export type CampaignDraft = z.infer<typeof Draft>;

const PROMPT = `You are a senior property marketing strategist and copywriter in Thailand. You write campaigns for small luxury housing projects (pool villas) that sell to Thai buyers and to foreign buyers and retirees (European, Chinese, Russian, other Asian).

From the project facts, the marketing plan and the campaign brief, produce:
1. concept: one big idea (a short line), the buyer insight it rests on, 3-5 message angles, a key visual direction a designer can shoot or render, and 5-10 hashtags.
2. copies: ready-to-post texts for the campaign's channels and languages. For every channel in the brief, write at least one piece in every language asked for, in the format that suits it (Facebook/Instagram: POST and AD, Google: SEARCH_AD with a headline up to 30 characters and body up to 90, TikTok/YouTube: VIDEO_SCRIPT with scene-by-scene lines, LINE: LINE_MESSAGE, email: EMAIL, portal/website: ARTICLE, print: BROCHURE). At most 16 pieces in total.

Rules:
- Use only facts given (prices, sizes, spec, location, offers). Never invent a price, a discount, a date, an award or a guarantee. If a fact you would like is missing, write around it.
- Prices are in Thai baht; write them as given (e.g. "15.65 ล้านบาท" / "THB 15.65M").
- Foreign buyers cannot own land in Thailand outright: do not promise freehold land to foreigners. Leasehold or company structures may only be mentioned if the brief or plan mentions them.
- Follow Thai advertising norms: no superlatives you cannot back ("ดีที่สุด", "No.1"), no guaranteed returns or rental yields unless the plan states them.
- Thai copy should read naturally for Thai social media, not like a translation. English copy should be warm, concise and premium.
- Match the brand tone in the plan. Keep each body under 900 characters (scripts may be longer). A clear CTA in every piece.`;

export type DraftInput = {
  project: { name: string; code: string };
  facts: string[];
  plan: Record<string, string | number | null>;
  campaign: Record<string, string | number | string[] | null>;
  extra: string | null;
};

const lines = (o: Record<string, unknown>) =>
  Object.entries(o)
    .filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");

/** Drafts a campaign concept and its captions / ad copies from the project's real data. */
export async function draftCampaign(input: DraftInput) {
  const client = new Anthropic();
  const text = [
    `PROJECT: ${input.project.name} (${input.project.code})`,
    input.facts.length ? `PROJECT FACTS:\n${input.facts.map((f) => `- ${f}`).join("\n")}` : "",
    `MARKETING PLAN:\n${lines(input.plan) || "- (not filled in yet)"}`,
    `CAMPAIGN BRIEF:\n${lines(input.campaign)}`,
    input.extra ? `EXTRA INSTRUCTIONS FROM THE MARKETER:\n${input.extra}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const response = await client.beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 32000,
    system: PROMPT,
    output_config: { effort: "medium", format: betaZodOutputFormat(Draft) },
    ...AI_FALLBACK,
    messages: [{ role: "user", content: text }],
  });
  if (response.stop_reason === "refusal") throw new AiRefusalError();
  if (response.stop_reason === "max_tokens") throw new AiTooLongError();
  if (!response.parsed_output) throw new AiRefusalError();
  return { draft: response.parsed_output, usage: response.usage };
}

// ---------------------------------------------------------------- marketing plan from files

const PlanDraft = z.object({
  tagline: z.string().nullable(),
  location_text: z.string().nullable(),
  website_url: z.string().nullable(),
  target_audience: z.string(),
  personas: z.string(),
  usp: z.string(),
  key_message: z.string(),
  positioning: z.string(),
  competitors: z.string().nullable(),
  brand_tone: z.string(),
  brand_fonts: z.string().nullable(),
  brand_colors: z.array(z.object({ name: z.string(), hex: z.string() })),
  budget_total: z.number().nullable(),
  goal_leads: z.number().nullable(),
  goal_bookings: z.number().nullable(),
  goal_sales_value: z.number().nullable(),
  notes: z.string(),
  summary: z.string(),
});
export type PlanDraftResult = z.infer<typeof PlanDraft>;

const PLAN_PROMPT = `You are a senior property marketing strategist in Thailand. You write the marketing plan for a small luxury housing project (pool villas) that sells to Thai buyers and to foreign buyers and retirees.

You get the project's facts from its database (units, prices, house types, land sizes, spec), the marketer's notes on the concept, and the project's files: logo, CI / brand guide, brochures, presentations and other material.

Read the files carefully:
- Brand colours: take them from the CI / brand guide when it lists them (copy the hex codes exactly; convert CMYK/RGB/Pantone to hex when given). Otherwise read the dominant colours of the logo. Name each colour (Primary, Secondary, Accent, Neutral ...). At most 6.
- Fonts: the typefaces the brand guide names, or the closest well-known match to the logo's lettering, saying it is a match.
- Tagline, location, website, selling points and wording that the brochure or presentation already uses: reuse them.

Then write the plan in Thai (keep English brand names and taglines as they are):
- target_audience: the main buyer groups, in priority order.
- personas: 2-3 personas, each with age, origin, motivation, worries and how they buy.
- usp: one selling point per line, specific to this project.
- key_message: one or two sentences.
- positioning: against the competitors in the area; competitors only if the files or notes name them.
- brand_tone: how the brand speaks.
- budget_total: a recommended total marketing budget in baht, around 2-4% of total list value unless the notes say otherwise, explained in notes; goal_leads and goal_bookings consistent with the number of units (assume roughly 1 booking per 40-60 qualified leads for this kind of product, and say so in notes); goal_sales_value = total list value of unsold units when known.
- notes: the reasoning behind the budget and goals, the recommended channel mix and phasing (pre-launch, launch, sustain), and anything the files did not show that the team should provide.
- summary: 2-3 sentences in Thai saying which files you read and what you took from each.

Rules: use only what the facts, notes and files say for prices, sizes and offers; never invent awards, guarantees, rental yields or land ownership for foreigners. Null for anything you cannot support.`;

export type PlanFile =
  | {
      name: string;
      kind: "image";
      media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
      data: string;
    }
  | { name: string; kind: "pdf"; data: string }
  | { name: string; kind: "text"; text: string };

/** Drafts the project's marketing plan from its facts, the marketer's notes and its uploaded files. */
export async function draftMarketingPlan(input: {
  project: { name: string; code: string };
  facts: string[];
  notes: string | null;
  current: Record<string, unknown> | null;
  files: PlanFile[];
}) {
  const client = new Anthropic();
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const f of input.files) {
    content.push({ type: "text", text: `FILE: ${f.name}` });
    if (f.kind === "image")
      content.push({
        type: "image",
        source: { type: "base64", media_type: f.media_type, data: f.data },
      });
    else if (f.kind === "pdf")
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: f.data },
        title: f.name,
      });
    else content.push({ type: "text", text: f.text });
  }
  const current = input.current
    ? Object.entries(input.current)
        .filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length))
        .map(([k, v]) => `- ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join("\n")
    : "";
  content.push({
    type: "text",
    text: [
      `PROJECT: ${input.project.name} (${input.project.code})`,
      input.facts.length ? `PROJECT FACTS:\n${input.facts.map((f) => `- ${f}`).join("\n")}` : "",
      input.notes ? `CONCEPT AND NOTES FROM THE MARKETER:\n${input.notes}` : "",
      current ? `WHAT THE PLAN SAYS NOW (improve on it, keep what is good):\n${current}` : "",
      input.files.length ? `${input.files.length} file(s) attached above.` : "No files attached.",
      "Write the marketing plan.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  const response = await client.beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 32000,
    system: PLAN_PROMPT,
    output_config: { effort: "medium", format: betaZodOutputFormat(PlanDraft) },
    ...AI_FALLBACK,
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal") throw new AiRefusalError();
  if (response.stop_reason === "max_tokens") throw new AiTooLongError();
  if (!response.parsed_output) throw new AiRefusalError();
  return { plan: response.parsed_output, usage: response.usage };
}
