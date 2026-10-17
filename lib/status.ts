export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

const tones: Record<string, Tone> = {
  // project
  PLANNING: "neutral",
  ACTIVE: "info",
  ON_HOLD: "warning",
  COMPLETED: "success",
  ARCHIVED: "neutral",
  // unit commercial state
  AVAILABLE: "success",
  HOLD: "warning",
  RESERVED: "accent",
  CONTRACTED: "info",
  SOLD: "info",
  TRANSFERRED: "neutral",
  UNAVAILABLE: "neutral",
  // documents
  DRAFT: "warning",
  APPROVED: "info",
  POSTED: "success",
  VOID: "danger",
  CLOSED: "neutral",
  CANCELLED: "danger",
};

export function toneOf(code: string | null | undefined): Tone {
  return (code && tones[code]) || "neutral";
}

export const projectStatuses = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] as const;
export const unitStatuses = [
  "AVAILABLE",
  "HOLD",
  "RESERVED",
  "CONTRACTED",
  "SOLD",
  "TRANSFERRED",
  "UNAVAILABLE",
] as const;
export const constructionStages = [
  "NOT_STARTED",
  "FOUNDATION",
  "STRUCTURE",
  "ROOF",
  "MEP",
  "FINISHING",
  "INSPECTION",
  "COMPLETED",
] as const;
export const soldStatuses = new Set(["CONTRACTED", "SOLD", "TRANSFERRED"]);

/** Fill colour per unit status, used by inventory bars and legends. */
export const unitStatusColor: Record<string, string> = {
  AVAILABLE: "bg-emerald-500",
  HOLD: "bg-amber-400",
  RESERVED: "bg-violet-500",
  CONTRACTED: "bg-sky-500",
  SOLD: "bg-blue-700",
  TRANSFERRED: "bg-slate-500",
  UNAVAILABLE: "bg-slate-300",
};
