import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, embedded commas and newlines", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi""\nthere"\r\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"\nthere'],
    ]);
  });

  it("strips the Excel UTF-8 BOM and keeps Thai text", () => {
    expect(parseCsv("﻿รหัส,ชื่อ\nU-01,บ้านหัวมุม")).toEqual([
      ["รหัส", "ชื่อ"],
      ["U-01", "บ้านหัวมุม"],
    ]);
  });

  it("drops blank lines and keeps empty fields", () => {
    expect(parseCsv("a,b,c\n\n,,\n1,,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });

  it("parses a last line without a trailing newline", () => {
    expect(parseCsv("a\n1")).toEqual([["a"], ["1"]]);
  });
});

describe("toCsv", () => {
  it("round-trips through parseCsv", () => {
    const rows = [
      ["unit_code", "name"],
      ["U-01", 'บ้าน "A", หัวมุม'],
    ];
    const text = toCsv(rows);
    expect(text.startsWith("﻿")).toBe(true);
    expect(parseCsv(text)).toEqual(rows);
  });
});
