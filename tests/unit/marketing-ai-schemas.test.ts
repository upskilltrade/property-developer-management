import { describe, expect, it } from "vitest";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { CampaignSet, Presentation, readPresentation } from "@/lib/marketing-ai";

const deck = {
  cover_line: "x",
  executive_summary: ["a"],
  big_idea: "b",
  positioning: { statement: "s", pillars: [{ title: "t", text: "x" }] },
  segments: [{ name: "EU", priority: "PRIMARY", share_pct: 50, description: "d" }],
  personas: [],
  value_props: [],
  brand: { tone_words: [], dos: [], donts: [], heading_font: null, body_font: null },
  channel_mix: [{ channel: "Facebook", pct: 40, amount: null, purpose: "leads" }],
  funnel: [{ stage: "Leads", count: 200 }],
  phases: [],
  cautions: [],
  next_steps: [{ task: "Photos", owner: null }],
};

describe("marketing AI schemas", () => {
  it("compile to structured-output formats", () => {
    expect(betaZodOutputFormat(Presentation).schema).toBeTruthy();
    expect(betaZodOutputFormat(CampaignSet).schema).toBeTruthy();
  });
  it("reads a stored presentation and rejects an outdated one", () => {
    expect(readPresentation(deck)?.segments[0].name).toBe("EU");
    expect(readPresentation({ ...deck, segments: "x" })).toBeNull();
    expect(readPresentation(null)).toBeNull();
  });
});
