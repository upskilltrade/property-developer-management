import { describe, expect, it } from "vitest";
import { hasReference, parseChecklist, standardsErrorKey } from "@/lib/standards";
import { voErrorKey } from "@/lib/variations";
import { withFlash } from "@/lib/form";
import { toNumber } from "@/lib/format";

describe("inspection references", () => {
  it("parses legacy string items and drops blanks", () => {
    expect(parseChecklist(["ตรวจไฟ", { item: " " }, { item: "ตรวจน้ำ", clause: "1" }])).toEqual([
      { item: "ตรวจไฟ" },
      { item: "ตรวจน้ำ", clause: "1" },
    ]);
    expect(parseChecklist(null)).toEqual([]);
  });

  it("an item counts as referenced only with a standard, clause and criterion", () => {
    expect(hasReference({ item: "x", standard_id: "s", clause: "4.2", criterion: "≥ 25 mm" })).toBe(
      true,
    );
    expect(hasReference({ item: "x", standard_id: "s", clause: " ", criterion: "c" })).toBe(false);
    expect(hasReference({ item: "x", clause: "1", criterion: "c" })).toBe(false);
  });

  it("maps database refusals to flash keys", () => {
    expect(standardsErrorKey("Standard not verified")).toBe("standardNotVerified");
    expect(standardsErrorKey("something else")).toBeNull();
    expect(voErrorKey("Not authorized")).toBe("permission");
    expect(voErrorKey("Variation is locked")).toBe("voLocked");
    expect(voErrorKey("VO is not approved")).toBe("voState");
  });
});

describe("helpers", () => {
  it("withFlash appends to existing queries", () => {
    expect(withFlash("/th/app", "saved", "1")).toBe("/th/app?saved=1");
    expect(withFlash("/th/app?view=x", "error", "a b")).toBe("/th/app?view=x&error=a%20b");
  });
  it("toNumber never returns NaN", () => {
    expect(toNumber("12.5")).toBe(12.5);
    expect(toNumber("abc")).toBe(0);
    expect(toNumber(null)).toBe(0);
  });
});
