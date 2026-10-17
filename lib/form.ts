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
export const formLocale = (fd: FormData) => toLocale(fd.get("locale"));

/** Appends a flash query param, e.g. withFlash("/th/app/projects", "saved", "1"). */
export function withFlash(path: string, key: "saved" | "error", value: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}
