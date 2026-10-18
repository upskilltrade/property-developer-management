import type { Tone } from "@/lib/status";

export const standardIssuers = [
  "DPT",
  "TISI",
  "EIT",
  "LAW",
  "MANUFACTURER",
  "COMPANY",
  "OTHER",
] as const;

export const standardTone: Record<string, Tone> = {
  UNVERIFIED: "warning",
  VERIFIED: "success",
  SUPERSEDED: "neutral",
};

/** Checklist item as stored on checklist_templates.items (references are required for QC). */
export type ChecklistItem = {
  item: string;
  standard_id?: string;
  standard_code?: string;
  clause?: string;
  criterion?: string;
  method?: string | null;
};

export function parseChecklist(items: unknown): ChecklistItem[] {
  return Array.isArray(items)
    ? items
        .map((x) => (typeof x === "string" ? { item: x } : (x as ChecklistItem)))
        .filter((x) => x?.item?.trim())
    : [];
}

export const hasReference = (i: ChecklistItem) =>
  Boolean(i.standard_id && i.clause?.trim() && i.criterion?.trim());

/** Maps reference-rule exceptions to flash keys; null when the message is about something else. */
export function standardsErrorKey(message: string | undefined) {
  if (!message) return null;
  if (message.includes("Item reference required")) return "referenceRequired";
  if (message.includes("Standard not verified")) return "standardNotVerified";
  if (message.includes("Standard document required")) return "standardDocRequired";
  return null;
}
