import type { Tone } from "@/lib/status";

export const partnerTypes = [
  "CONTRACTOR",
  "SUBCONTRACTOR",
  "SUPPLIER",
  "CONSULTANT",
  "ARCHITECT",
  "ENGINEER",
  "INSPECTOR",
  "OTHER",
] as const;
export const weathers = ["SUNNY", "CLOUDY", "RAIN", "STORM"] as const;
export const severities = ["LOW", "MEDIUM", "HIGH"] as const;
export const inspectionResults = ["PASS", "CONDITIONAL", "FAIL"] as const;

export const rfiTone: Record<string, Tone> = {
  OPEN: "warning",
  ANSWERED: "info",
  CLOSED: "neutral",
};
export const siTone: Record<string, Tone> = {
  ISSUED: "warning",
  ACKNOWLEDGED: "info",
  DONE: "success",
  CANCELLED: "neutral",
};
export const defectTone: Record<string, Tone> = {
  OPEN: "danger",
  FIXED: "warning",
  VERIFIED: "success",
};
export const inspectionTone: Record<string, Tone> = {
  PASS: "success",
  CONDITIONAL: "warning",
  FAIL: "danger",
};
export const severityTone: Record<string, Tone> = {
  LOW: "neutral",
  MEDIUM: "warning",
  HIGH: "danger",
};

/** Maps construction-ops RPC exceptions to flash keys. */
export function siteErrorKey(message: string | undefined) {
  if (!message) return "error";
  if (message.includes("Not authorized")) return "permission";
  if (message.includes("not assigned")) return "notAssigned";
  if (message.includes("verify their own")) return "selfVerifyFix";
  if (message.includes("RFI is closed")) return "rfiClosed";
  if (message.includes("site_reports_one_per_day")) return "reportExists";
  if (
    /is not (open|fixed|answered)|Invalid instruction state|Instruction is closed|Already verified/.test(
      message,
    )
  )
    return "wrongState";
  if (message.includes("photo")) return "photosRequired";
  if (/Invalid|required|duplicate key|Percent/.test(message)) return "invalid";
  return "error";
}
