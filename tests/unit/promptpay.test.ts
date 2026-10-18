import { describe, expect, it } from "vitest";
import { promptPayPayload, promptPaySvg } from "@/lib/promptpay";

// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), as EMVCo QR requires; computed here
// independently of the library under test.
function crc16(text: string) {
  let crc = 0xffff;
  for (const byte of Buffer.from(text, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Splits a top-level EMV payload into {tag: value}. */
function tags(payload: string) {
  const out: Record<string, string> = {};
  for (let i = 0; i < payload.length; ) {
    const tag = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    out[tag] = payload.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

describe("PromptPay payload", () => {
  it("phone number with amount: dynamic QR, 0066 phone, THB, amount, valid CRC", () => {
    const p = promptPayPayload("081-234-5678", 150000)!;
    const t = tags(p);
    expect(t["00"]).toBe("01");
    expect(t["01"]).toBe("12");
    expect(tags(t["29"])).toEqual({ "00": "A000000677010111", "01": "0066812345678" });
    expect(t["53"]).toBe("764");
    expect(t["58"]).toBe("TH");
    expect(t["54"]).toBe("150000.00");
    expect(t["63"]).toBe(crc16(p.slice(0, -4)));
  });

  it("13-digit tax ID uses sub-tag 02; no amount gives a static QR", () => {
    const p = promptPayPayload("0105561234567")!;
    const t = tags(p);
    expect(t["01"]).toBe("11");
    expect(t["54"]).toBeUndefined();
    expect(tags(t["29"])["02"]).toBe("0105561234567");
    expect(t["63"]).toBe(crc16(p.slice(0, -4)));
  });

  it("rounds amounts to satang and rejects invalid IDs", () => {
    expect(tags(promptPayPayload("0812345678", 1234.567)!)["54"]).toBe("1234.57");
    expect(promptPayPayload("12345")).toBeNull();
    expect(promptPayPayload("")).toBeNull();
  });

  it("renders an SVG QR", async () => {
    const svg = await promptPaySvg("0812345678", 50000);
    expect(svg).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
    expect(await promptPaySvg("123")).toBeNull();
  });
});
