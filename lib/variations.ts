import type { Tone } from "@/lib/status";

export const crSources = [
  "CUSTOMER",
  "DEVELOPER",
  "DESIGN",
  "SITE",
  "CONTRACTOR",
  "AUTHORITY",
] as const;

export const crTone: Record<string, Tone> = {
  SUBMITTED: "warning",
  UNDER_REVIEW: "info",
  CONVERTED: "success",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
};

export const voTone: Record<string, Tone> = {
  DRAFT: "neutral",
  PENDING_INTERNAL: "warning",
  INTERNAL_APPROVED: "info",
  OFFERED: "warning",
  CUSTOMER_APPROVED: "info",
  CUSTOMER_REJECTED: "danger",
  RELEASED: "success",
  CLOSED: "neutral",
  CANCELLED: "neutral",
};

/** Client-readable version columns; cost_delta is internal and comes from vo_costs(). */
export const VO_VERSION_COLUMNS =
  "id,vo_id,version,original_scope,revised_scope,price_delta,time_delta_days,note,created_by,created_at";

/** Maps variation RPC exceptions to flash keys. */
export function voErrorKey(message: string | undefined) {
  if (!message) return "error";
  if (message.includes("Not authorized")) return "permission";
  if (message.includes("locked")) return "voLocked";
  if (message.includes("own variation")) return "selfApproveVo";
  if (message.includes("Payment condition")) return "paymentCondition";
  if (message.includes("Drawing revision not released")) return "drawingNotReleased";
  if (message.includes("Comment required")) return "commentRequired";
  if (message.includes("has payments")) return "bookingHasPayments";
  if (/is not (a draft|pending|offered|approved|released)|Request is closed/.test(message))
    return "voState";
  if (/Invalid|required/.test(message)) return "invalid";
  return "error";
}
