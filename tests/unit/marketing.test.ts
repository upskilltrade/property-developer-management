import { describe, expect, it } from "vitest";
import {
  aiReadable,
  imageMediaType,
  mergePlan,
  campaignDays,
  colorsText,
  costPer,
  fileKind,
  goalShare,
  leadTagKey,
  marketingErrorKey,
  parseColors,
  parseTags,
  pickMany,
  channels,
  summarizeLeads,
} from "@/lib/marketing";

describe("marketing helpers", () => {
  it("reads brand colours typed one per line", () => {
    expect(parseColors("Primary #1F3A5F\n#c9a86a Gold\nno colour here\nSand: #fff")).toEqual([
      { name: "Primary", hex: "#1f3a5f" },
      { name: "Gold", hex: "#c9a86a" },
      { name: "Sand", hex: "#ffffff" },
    ]);
    expect(parseColors("")).toEqual([]);
    expect(colorsText(parseColors("Primary #1F3A5F\n#000000"))).toBe("Primary #1f3a5f\n#000000");
  });

  it("cleans tags", () => {
    expect(parseTags("facebook, Launch,launch , #1:1,,  ")).toEqual(["facebook", "Launch", "1:1"]);
  });

  it("keeps only known channels, in list order", () => {
    expect(pickMany(channels, ["TIKTOK", "FACEBOOK", "MYSPACE", "FACEBOOK"])).toEqual([
      "FACEBOOK",
      "TIKTOK",
    ]);
  });

  it("matches lead campaign text loosely", () => {
    expect(leadTagKey("  Launch   Q1 ")).toBe("launch q1");
    expect(leadTagKey("")).toBeNull();
  });

  it("totals lead stats per tag and source", () => {
    const s = summarizeLeads([
      { tag: "launch-q1", source: "FACEBOOK", leads: 10, qualified: 4, booked: 1, lost: 2 },
      { tag: "LAUNCH-Q1", source: "LINE", leads: 5, qualified: 2, booked: 1, lost: 0 },
      { tag: null, source: "FACEBOOK", leads: 3, qualified: 0, booked: 0, lost: 1 },
    ]);
    expect(s.total).toEqual({ leads: 18, qualified: 6, booked: 2, lost: 3 });
    expect(s.byTag.get("launch-q1")).toEqual({ leads: 15, qualified: 6, booked: 2, lost: 2 });
    expect(s.bySource.get("FACEBOOK")?.leads).toBe(13);
  });

  it("works out cost per result, goal share and days", () => {
    expect(costPer(100000, 40)).toBe(2500);
    expect(costPer(100000, 0)).toBeNull();
    expect(costPer(null, 5)).toBeNull();
    expect(goalShare(30, 60)).toBe(0.5);
    expect(goalShare(30, null)).toBeNull();
    expect(campaignDays("2026-12-01", "2026-12-31")).toBe(31);
    expect(campaignDays("2026-12-01", null)).toBeNull();
  });

  it("tells previewable files apart", () => {
    expect(fileKind("image/png", "logo.png")).toBe("image");
    expect(fileKind("image/vnd.adobe.photoshop", "ci.psd")).toBe("file");
    expect(fileKind("", "logo.svg")).toBe("image");
    expect(fileKind("application/pdf", "brochure.pdf")).toBe("pdf");
    expect(fileKind("video/mp4", "tour.mp4")).toBe("video");
    expect(fileKind("application/zip", "ci.zip")).toBe("file");
  });

  it("maps database errors to flash keys", () => {
    expect(marketingErrorKey("new row violates row-level security policy")).toBe("permission");
    expect(
      marketingErrorKey(
        'duplicate key value violates unique constraint "marketing_campaigns_project_id_code_key"',
      ),
    ).toBe("campaignCode");
    expect(marketingErrorKey("violates check constraint")).toBe("invalid");
  });

  it("knows which files the AI can read", () => {
    expect(aiReadable("image/png", "logo.png", 1000)).toBe("image");
    expect(aiReadable("image/png", "big.png", 6 * 1024 * 1024)).toBeNull();
    expect(aiReadable("application/pdf", "ci.pdf", 10 * 1024 * 1024)).toBe("pdf");
    expect(aiReadable("image/svg+xml", "logo.svg", 20_000)).toBe("text");
    expect(aiReadable("application/postscript", "logo.ai", 1000)).toBeNull();
    expect(aiReadable("", "brief.txt", 500)).toBe("text");
    expect(
      aiReadable(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "spec.docx",
        263754,
      ),
    ).toBe("office");
    expect(imageMediaType("", "a.PNG".toLowerCase())).toBe("image/png");
    expect(imageMediaType("image/webp", "x")).toBe("image/webp");
  });

  it("fills only empty plan fields unless overwriting", () => {
    const current = { tagline: "Ours", usp: "", brand_colors: [] };
    const draft = {
      tagline: "AI",
      usp: "Pool",
      brand_colors: [{ name: "P", hex: "#000000" }],
      notes: null,
    };
    expect(mergePlan(current, draft, false)).toEqual({
      usp: "Pool",
      brand_colors: draft.brand_colors,
    });
    expect(mergePlan(current, draft, true)).toEqual({
      tagline: "AI",
      usp: "Pool",
      brand_colors: draft.brand_colors,
    });
    expect(mergePlan(null, draft, false)).toEqual({
      tagline: "AI",
      usp: "Pool",
      brand_colors: draft.brand_colors,
    });
  });
});
