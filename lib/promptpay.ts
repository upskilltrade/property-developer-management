import "server-only";
import generatePayload from "promptpay-qr";
import QRCode from "qrcode";

/**
 * PromptPay "Thai QR Payment" payload (EMVCo merchant-presented QR, Bank of Thailand tag 29),
 * built by the promptpay-qr library. A phone number, 13-digit tax/citizen ID or 15-digit e-wallet
 * ID is accepted; an amount makes it a one-time QR that banking apps pre-fill.
 */
export function promptPayPayload(id: string, amount?: number) {
  const digits = id.replace(/\D/g, "");
  if (![10, 13, 15].includes(digits.length)) return null;
  const rounded = amount && amount > 0 ? Math.round(amount * 100) / 100 : undefined;
  return generatePayload(digits, { amount: rounded });
}

/** The payload as an inline SVG QR code, or null for an invalid PromptPay ID. */
export async function promptPaySvg(id: string, amount?: number) {
  const payload = promptPayPayload(id, amount);
  if (!payload) return null;
  return QRCode.toString(payload, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}
