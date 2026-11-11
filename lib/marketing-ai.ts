import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { AI_FALLBACK, AI_MODEL, AiRefusalError, AiTooLongError } from "@/lib/ai";
import { campaignObjectives, channels, copyFormats, copyLanguages } from "@/lib/marketing";

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
    max_tokens: 16000,
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
    max_tokens: 16000,
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

// ---------------------------------------------------------------- presentation deck

export const Presentation = z.object({
  cover_line: z.string(),
  executive_summary: z.array(z.string()),
  big_idea: z.string(),
  positioning: z.object({
    statement: z.string(),
    pillars: z.array(z.object({ title: z.string(), text: z.string() })),
  }),
  segments: z.array(
    z.object({
      name: z.string(),
      priority: z.enum(["PRIMARY", "SECONDARY", "NICHE"]),
      share_pct: z.number().nullable(),
      description: z.string(),
    }),
  ),
  personas: z.array(
    z.object({
      name: z.string(),
      age: z.string(),
      origin: z.string(),
      quote: z.string(),
      motivations: z.array(z.string()),
      worries: z.array(z.string()),
      how_they_buy: z.array(z.string()),
      channels: z.array(z.string()),
    }),
  ),
  value_props: z.array(z.object({ title: z.string(), items: z.array(z.string()) })),
  brand: z.object({
    tone_words: z.array(z.string()),
    dos: z.array(z.string()),
    donts: z.array(z.string()),
    heading_font: z.string().nullable(),
    body_font: z.string().nullable(),
  }),
  channel_mix: z.array(
    z.object({
      channel: z.string(),
      pct: z.number(),
      amount: z.number().nullable(),
      purpose: z.string(),
    }),
  ),
  funnel: z.array(z.object({ stage: z.string(), count: z.number().nullable() })),
  phases: z.array(
    z.object({
      name: z.string(),
      timing: z.string(),
      goal: z.string(),
      activities: z.array(z.string()),
      kpis: z.array(z.string()),
    }),
  ),
  cautions: z.array(z.string()),
  next_steps: z.array(z.object({ task: z.string(), owner: z.string().nullable() })),
});
export type MarketingPresentation = z.infer<typeof Presentation>;

/** Reads a stored presentation; null when it is missing or no longer matches the schema. */
export function readPresentation(v: unknown): MarketingPresentation | null {
  const r = Presentation.safeParse(v);
  return r.success ? r.data : null;
}

const DECK_PROMPT = `You turn a property marketing plan into the content of a clear, professional presentation deck for the owner, the sales team and agencies. The project is a small luxury housing project (pool villas) in Thailand.

Restructure what the plan already says; do not add new facts. Write in Thai (keep English brand names, taglines and channel names as they are). Be short: slides are scanned, not read.
- cover_line: one line that sums up the plan.
- executive_summary: 3-5 bullets, each under 140 characters: who we sell to, the big idea, budget and goals, the phasing.
- big_idea: the key message as one memorable sentence.
- positioning: one statement and 3 pillars (title of 2-4 words + one sentence).
- segments: the target groups in priority order, with the share of buyers expected when the plan gives or implies it (null otherwise).
- personas: one per persona in the plan, split into short bullet lists (max 4 each); quote = what this person would say, in their voice; channels = where to reach them.
- value_props: the selling points grouped under 3-4 themes (e.g. Location, Design and spec, Lifestyle, Trust).
- brand: 3-5 tone words, 3-5 do's and don'ts for copy, the heading and body font names when the plan names them (font family name only, e.g. "Playfair Display").
- channel_mix: the budget split by channel as the notes give it; pct values must add up to 100; amount in baht when the plan gives the total budget.
- funnel: impressions/reach (when stated), leads, qualified leads, visits, bookings, from the goals and conversion assumptions in the plan; null where nothing supports a number.
- phases: pre-launch, launch, sustain (or what the plan uses), each with timing, goal, 3-5 activities and 2-3 KPIs.
- cautions: legal and communication guardrails (foreign ownership, no guaranteed yields, advertising norms) and risks.
- next_steps: the data and material the team still has to provide, with an owner role when obvious.`;

/** Restructures the saved plan into a presentation deck (text only, no files). */
export async function structurePlan(input: {
  project: { name: string; code: string };
  facts: string[];
  plan: Record<string, unknown>;
}) {
  const client = new Anthropic();
  const text = [
    `PROJECT: ${input.project.name} (${input.project.code})`,
    input.facts.length ? `PROJECT FACTS:\n${input.facts.map((f) => `- ${f}`).join("\n")}` : "",
    `MARKETING PLAN:\n${lines(input.plan)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const response = await client.beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    system: DECK_PROMPT,
    output_config: { effort: "low", format: betaZodOutputFormat(Presentation) },
    ...AI_FALLBACK,
    messages: [{ role: "user", content: text }],
  });
  if (response.stop_reason === "refusal") throw new AiRefusalError();
  if (response.stop_reason === "max_tokens") throw new AiTooLongError();
  if (!response.parsed_output) throw new AiRefusalError();
  return { presentation: response.parsed_output, usage: response.usage };
}

// ---------------------------------------------------------------- campaigns per target group

const Copy = Draft.shape.copies.element;
export const CampaignSet = z.object({
  campaigns: z.array(
    z.object({
      segment: z.string(),
      code: z.string(),
      name: z.string(),
      objective: z.enum(campaignObjectives),
      audience: z.string(),
      targeting: z.string(),
      key_message: z.string(),
      offer: z.string().nullable(),
      channels: z.array(z.enum(channels)),
      languages: z.array(z.enum(copyLanguages)),
      budget: z.number().nullable(),
      start_date: z.string().nullable(),
      end_date: z.string().nullable(),
      goal_leads: z.number().nullable(),
      goal_bookings: z.number().nullable(),
      rationale: z.string(),
      concept: Draft.shape.concept,
      copies: z.array(Copy),
    }),
  ),
});
export type CampaignSuggestion = z.infer<typeof CampaignSet>["campaigns"][number];

const SET_PROMPT = `${PROMPT}

TASK NOW: plan the campaigns for the project, ONE CAMPAIGN PER TARGET GROUP. The buyer pool is small and specific, so each campaign speaks to one group only, in that group's language, on the channels that group actually uses, with tight targeting instead of broad reach.

For every target group in the plan (personas / segments, in priority order, at most 5; skip a group a campaign already covers unless asked), give:
- segment: the group's name as the plan calls it.
- code: short, upper case, e.g. "TH-FAMILY", "EU-RETIREE", "CN-INVESTOR".
- name: a campaign name in Thai (brand names in English).
- objective: usually LEADS; AWARENESS only for a group that does not know the area yet.
- audience: who exactly, in one or two sentences.
- targeting: practical ad-platform settings in Thai: countries/cities or radius, age range, languages, interests and behaviours, lookalike/retargeting sources, keywords for Google, placements; also agents/portals for groups that buy through them.
- key_message and offer: the message for this group; offer only if the plan or brief states one, otherwise null.
- channels and languages: the group's own (e.g. Thai buyers: FACEBOOK, LINE, GOOGLE in TH; Chinese buyers: WeChat is not in the list, so use AGENT/PORTAL/OTHER and ZH; Europeans: FACEBOOK, GOOGLE, PORTAL in EN/DE/RU as fits).
- budget: this group's share of the plan's total budget in baht, by its priority; all campaigns together should use no more than the plan's budget for paid and agent channels. Null when the plan has no budget.
- start_date / end_date: YYYY-MM-DD within the plan's dates when the plan has dates, else null.
- goal_leads / goal_bookings: this group's share of the plan's goals.
- rationale: two or three Thai sentences on why this group, why these channels and how to judge success.
- concept: as above, for this group.
- copies: 2 or 3 ready-to-post pieces for the group's main channel(s) in its language(s).`;

/** Plans one campaign per target group (persona / segment) from the marketing plan. */
export async function suggestCampaigns(input: {
  project: { name: string; code: string };
  facts: string[];
  plan: Record<string, string | number | null>;
  existing: string[];
  extra: string | null;
}) {
  const client = new Anthropic();
  const text = [
    `PROJECT: ${input.project.name} (${input.project.code})`,
    input.facts.length ? `PROJECT FACTS:\n${input.facts.map((f) => `- ${f}`).join("\n")}` : "",
    `MARKETING PLAN:\n${lines(input.plan) || "- (not filled in yet)"}`,
    input.existing.length
      ? `CAMPAIGNS THAT ALREADY EXIST:\n${input.existing.map((c) => `- ${c}`).join("\n")}`
      : "",
    input.extra ? `EXTRA INSTRUCTIONS FROM THE MARKETER:\n${input.extra}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const response = await client.beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    system: SET_PROMPT,
    output_config: { effort: "low", format: betaZodOutputFormat(CampaignSet) },
    ...AI_FALLBACK,
    messages: [{ role: "user", content: text }],
  });
  if (response.stop_reason === "refusal") throw new AiRefusalError();
  if (response.stop_reason === "max_tokens") throw new AiTooLongError();
  if (!response.parsed_output) throw new AiRefusalError();
  return { campaigns: response.parsed_output.campaigns.slice(0, 5), usage: response.usage };
}
