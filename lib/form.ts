import { toLocale } from "@/lib/i18n/config";

export const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
export const optStr = (fd: FormData, key: string) => str(fd, key) || null;
export const code = (fd: FormData, key: string) => str(fd, key).toUpperCase();
export const num = (fd: FormData, key: string) => {
  const v = str(fd, key);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
/**
 * A typed-in number as plain text for an RPC: tolerates "25%", "1,500,000", "฿", "บาท" and Thai digits.
 * Returns "" when blank and null when it still isn't a number.
 */
export const numText = (fd: FormData, key: string) => {
  const v = str(fd, key)
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50))
    .replace(/[\s,%฿]|บาท/g, "");
  if (!v) return "";
  return /^-?\d*\.?\d+$/.test(v) ? v : null;
};
export const formLocale = (fd: FormData) => toLocale(fd.get("locale"));

/** Appends a flash query param, e.g. withFlash("/th/app/projects", "saved", "1"). */
export function withFlash(path: string, key: "saved" | "error", value: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}
