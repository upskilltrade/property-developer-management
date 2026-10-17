import type { Tone } from "@/lib/status";

export const handoverSteps = [
  "NOT_READY",
  "READY",
  "CUSTOMER_INSPECTION",
  "ACCEPTED",
  "HANDED_OVER",
] as const;
export const itemKinds = [
  "KEY",
  "METER",
  "MANUAL",
  "EQUIPMENT",
  "DOCUMENT",
  "WARRANTY",
  "OTHER",
] as const;
export const inspectionPurposes = ["QC", "PRE_HANDOVER", "CUSTOMER", "HANDOVER"] as const;

export const handoverTone: Record<string, Tone> = {
  NOT_READY: "neutral",
  READY: "info",
  CUSTOMER_INSPECTION: "warning",
  ACCEPTED: "accent",
  HANDED_OVER: "success",
};
export const srTone: Record<string, Tone> = {
  OPEN: "warning",
  ASSIGNED: "info",
  RESOLVED: "accent",
  CLOSED: "success",
  REJECTED: "neutral",
};

/** Checklist template items are stored as [{ item }] (or plain strings). */
export function checklistItems(items: unknown): string[] {
  return Array.isArray(items)
    ? items
        .map((x) => (typeof x === "string" ? x : (x as { item?: string })?.item))
        .filter((x): x is string => !!x && !!x.trim())
    : [];
}

/** Maps handover/warranty RPC exceptions to flash keys. */
export function handoverErrorKey(message: string | undefined) {
  if (!message) return "error";
  if (message.includes("Not authorized")) return "permission";
  if (message.includes("Construction not complete")) return "notComplete";
  if (message.includes("Critical defects")) return "criticalDefects";
  if (message.includes("Customer defects")) return "customerDefects";
  if (message.includes("items not delivered")) return "itemsNotDelivered";
  if (message.includes("file not uploaded")) return "handoverFile";
  if (message.includes("not at this step")) return "handoverStep";
  if (message.includes("is completed")) return "handoverDone";
  if (message.includes("not handed over")) return "notHandedOver";
  if (/is not (open|resolved)/.test(message)) return "wrongState";
  if (/Invalid|required/.test(message)) return "invalid";
  return "error";
}
