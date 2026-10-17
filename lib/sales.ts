import type { Tone } from "@/lib/status";

export const leadStages = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "VIEWING",
  "NEGOTIATION",
  "BOOKED",
  "LOST",
] as const;
/** Stages a person may set by hand; BOOKED comes only from a booking. */
export const manualStages = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "VIEWING",
  "NEGOTIATION",
  "LOST",
] as const;
export const leadSources = [
  "WALK_IN",
  "FACEBOOK",
  "LINE",
  "WEBSITE",
  "REFERRAL",
  "AGENT",
  "EVENT",
  "OTHER",
] as const;
export const activityKinds = ["CALL", "LINE", "EMAIL", "MEETING", "NOTE"] as const;

export const stageTone: Record<string, Tone> = {
  NEW: "neutral",
  CONTACTED: "info",
  QUALIFIED: "accent",
  VIEWING: "info",
  NEGOTIATION: "warning",
  BOOKED: "success",
  LOST: "danger",
};

export const bookingTone: Record<string, Tone> = {
  PENDING_APPROVAL: "warning",
  CONFIRMED: "success",
  CANCELLED: "neutral",
};

/** Site timezone: datetime-local inputs are read and shown in Bangkok time (projects default). */
export const SITE_TZ_OFFSET = "+07:00";

/** datetime-local value for "now + hours" in Bangkok time. */
export function localDateTime(hoursFromNow = 0) {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000 + 7 * 3_600_000);
  return d.toISOString().slice(0, 16);
}

/** "2026-10-18T10:00" from a datetime-local input, as an ISO timestamp in Bangkok time. */
export const fromLocalDateTime = (v: string) => (v ? `${v}:00${SITE_TZ_OFFSET}` : null);

/** Epoch ms N days from now (negative for the past); kept out of render bodies for purity lint. */
export const daysFromNow = (days: number) => Date.now() + days * 86_400_000;
