import { describe, expect, it } from "vitest";
import { suggestedPrice } from "@/lib/unit-pricing";

describe("suggestedPrice", () => {
  it("adds the extra land per ตร.ว. above the standard plot", () => {
    // Monteva PLOT-01: 799.39 sq.m. vs the standard 591.91 sq.m. = 51.87 ตร.ว.
    expect(suggestedPrice(15_000_000, 799.39, 591.91, 25000)).toBe(16_300_000);
    expect(suggestedPrice(15_000_000, 654.6, 591.91, 25000)).toBe(15_390_000);
  });
  it("keeps the base price for the standard plot or unknown areas", () => {
    expect(suggestedPrice(15_000_000, 591.91, 591.91, 25000)).toBe(15_000_000);
    expect(suggestedPrice(15_000_000, null, 591.91, 25000)).toBe(15_000_000);
  });
});
