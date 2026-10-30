import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { AI_FALLBACK, AI_MODEL, AiRefusalError } from "@/lib/ai";
import {
  competitorPrice,
  offeringOptions,
  productTypes,
  type Assumptions,
  type Competitor,
  type ZoneStats,
} from "@/lib/market";

type Usage = { input_tokens: number; output_tokens: number };
const addUsage = (a: Usage, b: { input_tokens: number; output_tokens: number }) => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
});

// ---------------------------------------------------------------- web research for one area

const Found = z.object({
  competitors: z.array(
    z.object({
      name: z.string(),
      developer: z.string().nullable(),
      location_text: z.string().nullable(),
      lat: z.number().nullable(),
      lng: z.number().nullable(),
      product_type: z.enum(productTypes),
      status: z.enum(["SELLING", "SOLD_OUT", "UPCOMING", "UNKNOWN"]),
      grade: z.enum(["A", "B", "C"]).nullable(),
      price_min: z.number().nullable(),
      price_max: z.number().nullable(),
      house_area_min: z.number().nullable(),
      house_area_max: z.number().nullable(),
      land_area_min_wah: z.number().nullable(),
      land_area_max_wah: z.number().nullable(),
      bedrooms: z.string().nullable(),
      units_total: z.number().nullable(),
      offerings: z.array(z.enum(offeringOptions)),
      strengths: z.string().nullable(),
      weaknesses: z.string().nullable(),
      source_url: z.string(),
    }),
  ),
  land_prices: z.array(
    z.object({
      location_text: z.string(),
      lat: z.number().nullable(),
      lng: z.number().nullable(),
      kind: z.enum(["ASKING", "SOLD", "APPRAISAL"]),
      price_per_wah: z.number(),
      area_wah: z.number().nullable(),
      source_url: z.string(),
    }),
  ),
});
export type FoundCompetitor = z.infer<typeof Found>["competitors"][number];
export type FoundLand = z.infer<typeof Found>["land_prices"][number];

const RESEARCH_PROMPT = `You research the residential property market in Thailand for a developer deciding where to buy land and what to build. Search the web (listing sites such as FazWaz, Hipflat, DDproperty, Lazudi, Thailand-Property, developers' own sites, news) and report:
1. Housing projects for sale near the given area: project name, developer, where it is, price range in baht, house and land sizes, bedrooms, number of units, what it gives buyers (private pool, furniture, no common fee, views, golf, rental program, leasehold for foreigners ...), its strong and weak points, and a grade (A = premium build, brand and location; B = solid mid-market; C = basic or budget).
2. Land for sale or sold near the area, with the price per square wah (ตารางวา, 4 sq.m.; 1 rai = 400 ตร.ว.).

Rules:
- Only report what a page you opened says, and give that page's URL for every item. Never invent a project, a price or a URL.
- Convert land prices to baht per ตร.ว. and show the conversion in your notes (e.g. "4.8M per rai = 12,000/ตร.ว.").
- Give coordinates only if a page or map gives them; otherwise say the location in words.
- Prefer current listings (this year or last). Up to 15 projects and 15 land prices.
- Write in Thai.`;

const EXTRACT_PROMPT = `Turn the research notes into the structured result. Copy only what the notes state, each item with the URL the notes give for it; drop any item without a URL. Use null for anything the notes don't give. Prices in baht; land prices in baht per ตร.ว.; house areas in sq.m.; land areas in ตร.ว. Coordinates only if the notes give them. Strengths and weaknesses in Thai, one short sentence each.`;

/** Searches the web for competitor projects and land prices around one area. */
export async function researchArea(input: {
  area: string;
  lat: number;
  lng: number;
  radiusKm: number;
  known: string[];
}) {
  const client = new Anthropic();
  let usage: Usage = { input_tokens: 0, output_tokens: 0 };
  const question = [
    `Area: ${input.area} (centre ${input.lat.toFixed(5)}, ${input.lng.toFixed(5)}, within about ${input.radiusKm} km).`,
    input.known.length
      ? `Already recorded, skip unless you find newer prices: ${input.known.join("; ")}`
      : "Nothing recorded yet for this area.",
  ].join("\n");
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
  let response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 16000,
    system: RESEARCH_PROMPT,
    output_config: { effort: "medium" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 12 }],
    messages,
  });
  usage = addUsage(usage, response.usage);
  // The server's search loop pauses after its own step limit; resume it a few times.
  for (let i = 0; response.stop_reason === "pause_turn" && i < 4; i++) {
    response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      system: RESEARCH_PROMPT,
      output_config: { effort: "medium" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 12 }],
      messages: [...messages, { role: "assistant", content: response.content }],
    });
    usage = addUsage(usage, response.usage);
  }
  if (response.stop_reason === "refusal") throw new AiRefusalError();
  // Pages the search actually returned: an item may only cite one of these.
  const seen = new Set<string>();
  for (const block of response.content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content))
      for (const r of block.content) seen.add(r.url);
    if (block.type === "text")
      for (const c of block.citations ?? []) if ("url" in c && c.url) seen.add(c.url);
  }
  const notes = response.content
    .map((b) => {
      if (b.type !== "text") return "";
      const urls = (b.citations ?? []).map((c) => ("url" in c ? c.url : "")).filter(Boolean);
      return urls.length ? `${b.text} [${[...new Set(urls)].join(" ")}]` : b.text;
    })
    .join("");

  const parsed = await client.beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    system: EXTRACT_PROMPT,
    output_config: { effort: "low", format: betaZodOutputFormat(Found) },
    ...AI_FALLBACK,
    messages: [{ role: "user", content: `${question}\n\nRESEARCH NOTES:\n${notes}` }],
  });
  usage = addUsage(usage, parsed.usage);
  if (parsed.stop_reason === "refusal" || !parsed.parsed_output) throw new AiRefusalError();
  const cited = (url: string) => seen.has(url.trim());
  const found = parsed.parsed_output;
  return {
    competitors: found.competitors.filter((c) => c.name.trim() && cited(c.source_url)),
    land_prices: found.land_prices.filter((l) => l.price_per_wah > 0 && cited(l.source_url)),
    dropped:
      found.competitors.filter((c) => !cited(c.source_url)).length +
      found.land_prices.filter((l) => !cited(l.source_url)).length,
    usage,
  };
}

// ---------------------------------------------------------------- where to play

const Analysis = z.object({
  summary_th: z.string(),
  zones: z.array(
    z.object({
      zone: z.string(),
      verdict: z.enum(["PLAY", "WATCH", "AVOID", "NEED_DATA"]),
      reason_th: z.string(),
      product_th: z.string(),
      target_price_th: z.string(),
    }),
  ),
  competitors: z.array(
    z.object({
      name: z.string(),
      threat: z.enum(["HIGH", "MEDIUM", "LOW"]),
      strengths_th: z.string(),
      weaknesses_th: z.string(),
    }),
  ),
  gaps_th: z.array(z.string()),
  risks_th: z.array(z.string()),
  next_data_th: z.array(z.string()),
});
export type MarketAnalysis = z.infer<typeof Analysis>;

const ANALYSIS_PROMPT = `You advise a Thai developer of pool villas and houses on where to buy land next. You are given each ZONE's numbers (land prices per ตร.ว., competitor prices, the most the developer can pay for land under its own scheme, and the headroom between them) and the COMPETITOR projects recorded in it.

Decide for each zone: PLAY (numbers leave room and the product can stand out), WATCH (thin room or crowded), AVOID (land too dear for what sells there), or NEED_DATA (too few prices to judge). Say why in one or two sentences with the numbers, what product to build there (size, price band, what to give buyers that rivals don't), and the land price to aim for.

For the competitors that matter most (at most 10), give their threat to us and their strengths and weaknesses. Then list market gaps no one fills, the main risks, and what data to collect next.

Rules: use only the numbers given; never invent a project, price or place. Unverified AI-found rows may be wrong: say so when a verdict leans on them. Write everything in Thai, short and concrete.`;

export async function analyzeMarket(stats: ZoneStats[], a: Assumptions) {
  const fmt = (v: number | null) => (v == null ? "-" : Math.round(v).toLocaleString("en-US"));
  const comp = (c: Competitor) => {
    const p = competitorPrice(c);
    return [
      `- ${c.name}${c.developer ? ` (${c.developer})` : ""}`,
      `grade ${c.grade ?? "-"}`,
      c.status,
      `price ${fmt(c.price_min)}–${fmt(c.price_max)}`,
      `house ${fmt(c.house_area_min)}–${fmt(c.house_area_max)} sq.m.`,
      `${fmt(p.perSqm)}/sq.m.`,
      c.offerings.length ? `gives ${c.offerings.join(", ")}` : "",
      c.strengths ? `strong: ${c.strengths}` : "",
      c.weaknesses ? `weak: ${c.weaknesses}` : "",
      c.verified ? "" : "UNVERIFIED",
    ]
      .filter(Boolean)
      .join(" · ");
  };
  const text = [
    `OUR SCHEME: ${a.houseSqm} sq.m. house on ${a.plotWah} ตร.ว., build ${fmt(a.buildPerSqm)}/sq.m., roads and utilities ${fmt(a.infraPerPlot)} a plot, selling costs ${a.sellingPct}% of price, sale price must be at least ${a.priceToCost}× total cost. Our sale price is set from comparable competitors only (type ${a.compareType}, grade ${a.compareGrade}); a negative "most we can pay" means the scheme does not pay at those prices.`,
    ...stats.map((s) =>
      [
        `ZONE ${s.zone?.name ?? "Outside zones"}`,
        `land prices: ${s.lands.length} (asking/sold median ${fmt(s.landMedian)}, sold median ${fmt(s.soldMedian)}, appraisal median ${fmt(s.appraisalMedian)}, market estimate ${fmt(s.marketLand)} per ตร.ว.)`,
        `competitors: ${s.competitors.length}, selling ${s.sellingCount}, median price ${fmt(s.compPriceMedian)}, median ${fmt(s.compPerSqmMedian)}/sq.m.`,
        `comparables: ${s.comparables.length}`,
        `if we price at the comparables' median: sale ${fmt(s.ourSalePrice)}, most we can pay ${fmt(s.residualPerWah)} per ตร.ว., headroom ${s.headroomPct == null ? "-" : `${s.headroomPct.toFixed(0)}%`}`,
        ...s.competitors.map(comp),
      ].join("\n"),
    ),
  ].join("\n\n");
  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    system: ANALYSIS_PROMPT,
    output_config: { effort: "high", format: betaZodOutputFormat(Analysis) },
    ...AI_FALLBACK,
    messages: [{ role: "user", content: text }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) throw new AiRefusalError();
  return { analysis: response.parsed_output, usage: response.usage };
}
