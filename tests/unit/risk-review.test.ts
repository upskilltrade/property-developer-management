import { describe, expect, it } from "vitest";
import { validateRisks, type RiskEvidence } from "@/lib/risk-review";

const records = new Map<string, RiskEvidence>([
  ["I1", { id: "I1", label: "INS-001 · UNIT-02", link: "/th/app/projects/p/units/u2" }],
  ["H3", { id: "H3", label: "P001 UNIT-03", link: "/th/app/projects/p/units/u3" }],
]);
const risk = (evidence: string[], title = "x") => ({
  category: "SCHEDULE" as const,
  severity: "HIGH" as const,
  title_th: title,
  title_en: title,
  explanation_th: "",
  explanation_en: "",
  action_th: "",
  action_en: "",
  owner_role: "PM",
  evidence,
});

describe("validateRisks", () => {
  it("keeps only citations to records that were sent, mapped to their links", () => {
    const out = validateRisks(
      { summary_th: "s", summary_en: "s", risks: [risk(["i1", "H3", "H99", "I1"])] },
      records,
    );
    expect(out.risks[0].evidence.map((e) => e.id)).toEqual(["I1", "H3"]);
    expect(out.risks[0].evidence[0].link).toBe("/th/app/projects/p/units/u2");
    expect(out.discarded).toBe(0);
  });

  it("drops risks that cite nothing real and counts them", () => {
    const out = validateRisks(
      {
        summary_th: "s",
        summary_en: "s",
        risks: [risk(["X1"], "made up"), risk([], "no evidence"), risk(["H3"], "real")],
      },
      records,
    );
    expect(out.risks.map((r) => r.title_en)).toEqual(["real"]);
    expect(out.discarded).toBe(2);
  });

  it("returns at most 8 risks", () => {
    const out = validateRisks(
      { summary_th: "s", summary_en: "s", risks: Array.from({ length: 12 }, () => risk(["I1"])) },
      records,
    );
    expect(out.risks).toHaveLength(8);
  });
});
