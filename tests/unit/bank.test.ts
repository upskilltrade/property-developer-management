import { describe, expect, it } from "vitest";
import { formatAccountNumber } from "@/lib/bank";

describe("formatAccountNumber", () => {
  it("groups 10-digit Thai account numbers", () => {
    expect(formatAccountNumber("1234567890")).toBe("123-4-56789-0");
  });
  it("leaves other lengths and empty values alone", () => {
    expect(formatAccountNumber("002233445566")).toBe("002233445566");
    expect(formatAccountNumber(null)).toBe("");
    expect(formatAccountNumber("")).toBe("");
  });
});
