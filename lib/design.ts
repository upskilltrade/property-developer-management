import type { Tone } from "@/lib/status";

export const disciplines = [
  "ARCHITECTURE",
  "INTERIOR",
  "STRUCTURE",
  "MEP",
  "LANDSCAPE",
  "POOL",
  "FURNITURE",
] as const;

export const materialCategories = [
  "FLOOR",
  "WALL",
  "CEILING",
  "SANITARY",
  "KITCHEN",
  "DOOR_WINDOW",
  "LIGHTING",
  "ROOF",
  "EXTERIOR",
  "OTHER",
] as const;

export const revisionTone: Record<string, Tone> = {
  DRAFT: "neutral",
  IN_REVIEW: "warning",
  APPROVED: "info",
  REJECTED: "danger",
  RELEASED: "success",
  SUPERSEDED: "neutral",
};

export const selectionTone: Record<string, Tone> = {
  DRAFT: "neutral",
  PUBLISHED: "warning",
  APPROVED: "success",
  CHANGE_REQUESTED: "danger",
  SUPERSEDED: "neutral",
};

/** Maps design RPC exceptions to flash keys. */
export function designErrorKey(message: string | undefined) {
  if (!message) return "error";
  if (message.includes("Not authorized")) return "permission";
  if (message.includes("file not uploaded")) return "designFile";
  if (message.includes("open revision")) return "openRevision";
  if (message.includes("own revision")) return "selfReview";
  if (message.includes("Comment required")) return "commentRequired";
  if (/is not (a draft|in review|approved)/.test(message)) return "revisionState";
  if (/Invalid|required|duplicate key/.test(message)) return "invalid";
  return "error";
}
