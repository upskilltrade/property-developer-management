/** Project marketing: brand kit files, the marketing plan, campaigns and their copy drafts. */

export const assetCategories = [
  "LOGO",
  "CI",
  "BROCHURE",
  "AD_CREATIVE",
  "SOCIAL",
  "VIDEO",
  "RENDER",
  "PHOTO",
  "FLOOR_PLAN",
  "PRICE_LIST",
  "PRESENTATION",
  "SIGNAGE",
  "OTHER",
] as const;
export type AssetCategory = (typeof assetCategories)[number];

export const assetStatuses = ["DRAFT", "REVIEW", "APPROVED", "ARCHIVED"] as const;
export const assetLanguages = ["TH", "EN", "ZH", "RU", "DE", "MULTI"] as const;
export const copyLanguages = ["TH", "EN", "ZH", "RU", "DE"] as const;

export const campaignObjectives = [
  "AWARENESS",
  "LEADS",
  "BOOKINGS",
  "EVENT",
  "RETARGETING",
  "BRAND",
] as const;
export const campaignStatuses = [
  "DRAFT",
  "PLANNED",
  "ACTIVE",
  "PAUSED",
  "DONE",
  "CANCELLED",
] as const;

/** Where a campaign runs. The same list is used for copies and, later, the media plan. */
export const channels = [
  "FACEBOOK",
  "INSTAGRAM",
  "GOOGLE",
  "YOUTUBE",
  "TIKTOK",
  "LINE",
  "WEBSITE",
  "PORTAL",
  "AGENT",
  "EVENT",
  "PRINT",
  "OUTDOOR",
  "EMAIL",
  "PR",
  "OTHER",
] as const;
export type Channel = (typeof channels)[number];

export const copyFormats = [
  "POST",
  "AD",
  "STORY",
  "VIDEO_SCRIPT",
  "LINE_MESSAGE",
  "EMAIL",
  "ARTICLE",
  "BROCHURE",
  "SEARCH_AD",
  "OTHER",
] as const;
export const copyStatuses = ["DRAFT", "APPROVED", "USED", "ARCHIVED"] as const;

/** Which lead sources (sales CRM) belong to which marketing channel. */
export const leadSourceChannel: Record<string, Channel> = {
  FACEBOOK: "FACEBOOK",
  LINE: "LINE",
  WEBSITE: "WEBSITE",
  AGENT: "AGENT",
  EVENT: "EVENT",
};

export const oneOf = <T extends string>(list: readonly T[], v: string | null | undefined) =>
  v && (list as readonly string[]).includes(v) ? (v as T) : null;

/** Keeps the known values of a multi-select, in list order, without duplicates. */
export const pickMany = <T extends string>(list: readonly T[], values: readonly string[]) =>
  list.filter((x) => values.includes(x));

export type BrandColor = { name: string; hex: string };

/**
 * Brand colours typed one per line: "Primary #1F3A5F", "#C9A86A Gold" or just "#fff".
 * Lines without a hex colour are skipped; 3-digit hex is expanded; at most 12 colours.
 */
export function parseColors(text: string): BrandColor[] {
  const out: BrandColor[] = [];
  for (const raw of text.split(/\r?\n|,|;/)) {
    const m = raw.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i);
    if (!m) continue;
    let hex = m[1].toLowerCase();
    if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
    const name = raw
      .replace(m[0], "")
      .replace(/[:\-–=]/g, " ")
      .trim()
      .replace(/\s+/g, " ");
    out.push({ name: name.slice(0, 40), hex: `#${hex}` });
    if (out.length === 12) break;
  }
  return out;
}

export const colorsText = (colors: BrandColor[] | null | undefined) =>
  (colors ?? []).map((c) => (c.name ? `${c.name} ${c.hex}` : c.hex)).join("\n");

/** Comma / newline separated tags, trimmed, de-duplicated (case-insensitive), at most 20. */
export function parseTags(text: string) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of text.split(/[,\n#]/)) {
    const tag = t.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
    if (out.length === 20) break;
  }
  return out;
}

/** The key a lead's free-text campaign field is matched on. */
export const leadTagKey = (tag: string | null | undefined) =>
  (tag ?? "").trim().replace(/\s+/g, " ").toLowerCase() || null;

export type LeadStatRow = {
  tag: string | null;
  source: string;
  leads: number;
  qualified: number;
  booked: number;
  lost: number;
};
export type LeadCounts = { leads: number; qualified: number; booked: number; lost: number };
const zero = (): LeadCounts => ({ leads: 0, qualified: 0, booked: 0, lost: 0 });
const add = (a: LeadCounts, r: LeadStatRow) => {
  a.leads += Number(r.leads) || 0;
  a.qualified += Number(r.qualified) || 0;
  a.booked += Number(r.booked) || 0;
  a.lost += Number(r.lost) || 0;
  return a;
};

/** Totals of marketing_lead_stats rows: all, per campaign tag and per lead source. */
export function summarizeLeads(rows: LeadStatRow[]) {
  const total = zero();
  const byTag = new Map<string, LeadCounts>();
  const bySource = new Map<string, LeadCounts>();
  for (const r of rows) {
    add(total, r);
    const key = leadTagKey(r.tag);
    if (key) add(byTag.get(key) ?? byTag.set(key, zero()).get(key)!, r);
    add(bySource.get(r.source) ?? bySource.set(r.source, zero()).get(r.source)!, r);
  }
  return { total, byTag, bySource };
}

/** Cost per lead / per booking; null when there is nothing to divide by. */
export const costPer = (spend: number | null | undefined, count: number) =>
  spend != null && spend > 0 && count > 0 ? spend / count : null;

/** Share of a goal reached, 0..∞ (1 = goal met); null without a goal. */
export const goalShare = (actual: number, goal: number | null | undefined) =>
  goal && goal > 0 ? actual / goal : null;

/** Days a campaign runs (inclusive), or null when a date is missing. */
export function campaignDays(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const d = (Date.parse(end) - Date.parse(start)) / 86_400_000;
  return Number.isFinite(d) && d >= 0 ? Math.round(d) + 1 : null;
}

/** File kind for preview: images show inline, PDFs and videos open in a new tab. */
export function fileKind(mime: string | null | undefined, name?: string | null) {
  const m = (mime ?? "").toLowerCase();
  const ext = (name ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (m.startsWith("image/") && !m.includes("photoshop") && !m.includes("tiff")) return "image";
  if (["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(ext)) return "image";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m.startsWith("video/") || ["mp4", "mov", "webm"].includes(ext)) return "video";
  return "file";
}

export function formatBytes(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Maps a database error to a flash key. */
export function marketingErrorKey(message: string | undefined) {
  if (!message) return "error";
  if (/row-level security|Not authorized|permission denied/.test(message)) return "permission";
  if (message.includes("marketing_campaigns_project_id_code_key")) return "campaignCode";
  if (/violates check|invalid input|null value|duplicate key/.test(message)) return "invalid";
  return "error";
}
