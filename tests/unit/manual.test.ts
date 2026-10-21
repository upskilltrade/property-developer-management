import { describe, expect, it } from "vitest";
import { groupManual, manual, manualFor } from "@/lib/manual";

describe("user manual", () => {
  it("has unique chapter ids and Thai content", () => {
    const ids = manual.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of manual) {
      expect(s.title.trim()).not.toBe("");
      expect(s.body).toMatch(/[฀-๿]/);
      expect(s.body).toMatch(/^## /m);
    }
  });

  it("shows owners every chapter", () => {
    expect(manualFor(new Set(["OWNER"]))).toHaveLength(manual.length);
  });

  it("shows other users general chapters plus their roles", () => {
    const customer = manualFor(new Set(["CUSTOMER"]));
    expect(customer.map((s) => s.id)).toContain("customer-portal-guide");
    expect(customer.map((s) => s.id)).toContain("basics-sign-in");
    expect(customer.map((s) => s.id)).not.toContain("admin-access");
    expect(customer.map((s) => s.id)).not.toContain("project-forecast");
    const contractor = manualFor(new Set(["CONTRACTOR"])).map((s) => s.id);
    expect(contractor).toContain("construction-contractor");
    expect(contractor).not.toContain("sales-contracts");
  });

  it("groups chapters in reading order", () => {
    const groups = groupManual(manual);
    expect(groups.flatMap((g) => g.items)).toHaveLength(manual.length);
    expect(new Set(groups.map((g) => g.group)).size).toBe(groups.length);
  });
});
