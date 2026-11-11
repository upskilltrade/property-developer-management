/** Project marketing: brand kit files, the marketing plan, campaigns and their copy drafts. */

export const assetCategories = [
  "PROJECT_DATA",
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

/** Brand-kit categories the AI reads by default when it drafts the marketing plan. */
export const planSourceCategories: readonly AssetCategory[] = [
  "PROJECT_DATA",
  "CI",
  "LOGO",
  "BROCHURE",
  "PRESENTATION",
  "PRICE_LIST",
  "FLOOR_PLAN",
];

/** How the AI can read a file: images and PDFs directly, small text files as text. */
export function aiReadable(
  mime: string | null | undefined,
  name: string | null | undefined,
  size: number | null | undefined,
) {
  const m = (mime ?? "").toLowerCase();
  const ext = (name ?? "").split(".").pop()?.toLowerCase() ?? "";
  const n = size ?? 0;
  if (
    ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(m) ||
    ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)
  )
    return n <= 5 * 1024 * 1024 ? ("image" as const) : null;
  if (m === "application/pdf" || ext === "pdf")
    return n <= 18 * 1024 * 1024 ? ("pdf" as const) : null;
  if (
    m === "image/svg+xml" ||
    m.startsWith("text/") ||
    ["svg", "txt", "md", "csv", "json"].includes(ext)
  )
    return n <= 300 * 1024 ? ("text" as const) : null;
  // Word / PowerPoint / Excel: the text is pulled out on the server.
  if (["docx", "pptx", "xlsx"].includes(ext))
    return n <= 20 * 1024 * 1024 ? ("office" as const) : null;
  return null;
}

/** Image media type for the AI from a MIME type or file name. */
export function imageMediaType(mime: string | null | undefined, name: string | null | undefined) {
  const m = (mime ?? "").toLowerCase();
  if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(m))
    return m as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  const ext = (name ?? "").split(".").pop()?.toLowerCase();
  return ext === "png"
    ? "image/png"
    : ext === "webp"
      ? "image/webp"
      : ext === "gif"
        ? "image/gif"
        : "image/jpeg";
}

/** Fills a plan from an AI draft: every field when overwriting, otherwise only the empty ones. */
export function mergePlan<T extends Record<string, unknown>>(
  current: Record<string, unknown> | null,
  draft: T,
  overwrite: boolean,
) {
  const empty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(draft)) {
    if (empty(v)) continue;
    if (overwrite || !current || empty(current[k])) out[k] = v;
  }
  return out;
}

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

/** A campaign code not used yet in the project ("EU-RETIREE", then "EU-RETIREE-2" ...); adds it to taken. */
export function uniqueCode(wanted: string, taken: Set<string>) {
  const base =
    wanted
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "CAMPAIGN";
  let code = base;
  for (let n = 2; taken.has(code); n++) code = `${base}-${n}`;
  taken.add(code);
  return code;
}

/**
 * Group names from free text: "Persona 1: Hans, 64, German retiree — ..." gives "Hans, 64, German
 * retiree"; otherwise each short line or bullet. At most 6.
 */
export function personaNames(text: string) {
  const heads = [
    ...text.matchAll(/(?:^|\n)\s*(?:persona|เพอร์โซนา|กลุ่ม(?:ที่)?)\s*\d+\s*[:.)–-]\s*([^\n]+)/gi),
  ];
  const pick = heads.length
    ? heads.map((m) => m[1])
    : text.split(/\n/).map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, ""));
  return pick
    .map((l) => l.split(/\s[—–]\s|:\s/)[0].trim())
    .filter((l) => l.length > 1 && l.length <= 120)
    .slice(0, 6);
}

/** Shares of a budget mix scaled to add up to 100 (the AI's percentages can drift). */
export function normalizeShares<T extends { pct: number }>(rows: T[]) {
  const clean = rows.filter((r) => Number.isFinite(r.pct) && r.pct > 0);
  const sum = clean.reduce((s, r) => s + r.pct, 0);
  return sum > 0 ? clean.map((r) => ({ ...r, pct: (r.pct / sum) * 100 })) : [];
}

/** A Google Fonts stylesheet URL for brand font names, or null when none look valid. */
export function googleFontsUrl(names: (string | null | undefined)[]) {
  const families = [
    ...new Set(
      names
        .map((n) =>
          (n ?? "")
            .replace(/[^A-Za-z0-9 ]/g, "")
            .trim()
            .replace(/\s+/g, " "),
        )
        .filter((n) => n.length >= 2 && n.length <= 40),
    ),
  ];
  if (!families.length) return null;
  return `https://fonts.googleapis.com/css2?${families
    .map((f) => `family=${f.replace(/ /g, "+")}:wght@400;600;700`)
    .join("&")}&display=swap`;
}

export type BrandColor = { name: string; hex: string };

/** Relative luminance of a #rrggbb colour, 0 (black) .. 1 (white). */
export function luminance(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Deck colours from the brand palette: the darkest colour for dark slides, the most saturated
 * other colour as accent, and a light tint for light slides. Falls back to navy and gold.
 */
export function deckPalette(colors: BrandColor[]) {
  const valid = colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c.hex));
  const byDark = [...valid].sort((a, b) => luminance(a.hex) - luminance(b.hex));
  const dark = byDark[0] && luminance(byDark[0].hex) < 0.2 ? byDark[0].hex : "#1f3a5f";
  const sat = (hex: string) => {
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return Math.max(...v) - Math.min(...v);
  };
  const accent =
    [...valid]
      .filter((c) => c.hex !== dark && luminance(c.hex) > 0.08 && luminance(c.hex) < 0.75)
      .sort((a, b) => sat(b.hex) - sat(a.hex))[0]?.hex ?? "#c9a86a";
  const light = byDark.reverse().find((c) => luminance(c.hex) > 0.8)?.hex ?? "#f6f3ee";
  return { dark, accent, light, onAccent: luminance(accent) > 0.45 ? "#111111" : "#ffffff" };
}

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
