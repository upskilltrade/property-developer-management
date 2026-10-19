import { describe, expect, it } from "vitest";
import { isThaiNationality, leaseEnd } from "@/lib/sales";

describe("isThaiNationality", () => {
  it("treats blank and the usual spellings as Thai", () => {
    for (const v of [null, "", " ", "ไทย", "Thai", "THAILAND", "th"])
      expect(isThaiNationality(v)).toBe(true);
  });
  it("flags any other recorded nationality", () => {
    for (const v of ["British", "จีน", "US", "Japanese"]) expect(isThaiNationality(v)).toBe(false);
  });
});

describe("leaseEnd", () => {
  it("adds the term in years", () => {
    expect(leaseEnd("2026-11-01", 30)).toBe("2056-11-01");
    expect(leaseEnd(null, 30)).toBeNull();
    expect(leaseEnd("2026-11-01", null)).toBeNull();
  });
});
