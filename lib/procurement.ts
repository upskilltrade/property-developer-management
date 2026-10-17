import type { Tone } from "@/lib/status";

export const budgetTone: Record<string, Tone> = {
  DRAFT: "neutral",
  SUBMITTED: "warning",
  APPROVED: "success",
  SUPERSEDED: "neutral",
  REJECTED: "danger",
};
export const prTone: Record<string, Tone> = {
  DRAFT: "neutral",
  SUBMITTED: "warning",
  APPROVED: "info",
  REJECTED: "danger",
  ORDERED: "success",
  CANCELLED: "neutral",
};
export const poTone: Record<string, Tone> = {
  PENDING_APPROVAL: "warning",
  APPROVED: "info",
  PARTIALLY_RECEIVED: "accent",
  RECEIVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};
export const claimTone: Record<string, Tone> = {
  SUBMITTED: "warning",
  CERTIFIED: "success",
  REJECTED: "danger",
};

/** Maps cost/procurement RPC exceptions to flash keys. */
export function procErrorKey(message: string | undefined) {
  if (!message) return "error";
  if (message.includes("Not authorized")) return "permission";
  if (message.includes("locked")) return "budgetLocked";
  if (/cannot (approve|certify) their own/.test(message)) return "selfApproveProc";
  if (message.includes("approval limit")) return "aboveLimit";
  if (/is not (a draft|submitted|approved|pending|open)|has deliveries/.test(message))
    return "procState";
  if (/Invalid|required|duplicate key/.test(message)) return "invalid";
  return "error";
}
