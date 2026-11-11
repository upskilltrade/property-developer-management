import { describe, expect, it } from "vitest";
import {
  deckPalette,
  googleFontsUrl,
  luminance,
  normalizeShares,
  personaNames,
  uniqueCode,
} from "@/lib/marketing";

describe("uniqueCode", () => {
  it("upper-cases, slugs and avoids codes in use", () => {
    const taken = new Set(["EU-RETIREE"]);
    expect(uniqueCode("eu retiree", taken)).toBe("EU-RETIREE-2");
    expect(uniqueCode("EU-RETIREE", taken)).toBe("EU-RETIREE-3");
    expect(uniqueCode("ไทย", taken)).toBe("CAMPAIGN");
    expect(taken.has("CAMPAIGN")).toBe(true);
  });
});

describe("normalizeShares", () => {
  it("scales to 100 and drops empty rows", () => {
    const r = normalizeShares([
      { channel: "A", pct: 30 },
      { channel: "B", pct: 30 },
      { channel: "C", pct: 0 },
    ]);
    expect(r.map((x) => x.pct)).toEqual([50, 50]);
    expect(normalizeShares([{ pct: 0 }])).toEqual([]);
  });
});

describe("googleFontsUrl", () => {
  it("builds one URL for valid family names", () => {
    expect(
      googleFontsUrl(["Cormorant Garamond", "Noto Sans Thai", null, "Cormorant Garamond"]),
    ).toBe(
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Noto+Sans+Thai:wght@400;600;700&display=swap",
    );
    expect(googleFontsUrl(["", null])).toBeNull();
    expect(googleFontsUrl(['x"><script>'])).toContain("family=xscript");
  });
});

describe("deckPalette", () => {
  it("takes the dark, accent and light colours from the brand palette", () => {
    const p = deckPalette([
      { name: "Ivory", hex: "#fefbf4" },
      { name: "Olive", hex: "#474c36" },
      { name: "Bronze", hex: "#a5825b" },
      { name: "Deep", hex: "#2f3324" },
    ]);
    expect(p).toMatchObject({ dark: "#2f3324", accent: "#a5825b", light: "#fefbf4" });
  });
  it("falls back without colours", () => {
    expect(deckPalette([])).toMatchObject({ dark: "#1f3a5f", accent: "#c9a86a" });
    expect(luminance("#ffffff")).toBeCloseTo(1);
  });
});

describe("personaNames", () => {
  it("reads persona headings", () => {
    const text =
      "Persona 1: Erik & Ingrid (63-67, Scandinavian) — motivation: ...\r\nPersona 2: คุณวิทยา (50-58) — แรงจูงใจ: ...";
    expect(personaNames(text)).toEqual(["Erik & Ingrid (63-67, Scandinavian)", "คุณวิทยา (50-58)"]);
  });
  it("falls back to numbered lines", () => {
    expect(personaNames("1) Foreign retirees\n2) Bangkok families")).toEqual([
      "Foreign retirees",
      "Bangkok families",
    ]);
  });
});
