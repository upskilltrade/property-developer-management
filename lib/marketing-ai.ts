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
