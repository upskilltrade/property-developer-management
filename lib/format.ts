import type { Locale } from "@/lib/i18n/config";

const intlLocale = (locale: Locale) => (locale === "th" ? "th-TH" : "en-US");

export const toNumber = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function formatMoney(locale: Locale, value: unknown, currency = "THB") {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

/** Compact money for KPI tiles, e.g. ฿12.5M */
export function formatMoneyCompact(locale: Locale, value: unknown, currency = "THB") {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(toNumber(value));
}

export function formatNumber(locale: Locale, value: unknown, digits = 0) {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: digits }).format(
    toNumber(value),
  );
}

export function formatPercent(locale: Locale, ratio: number) {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(ratio) ? ratio : 0);
}

/** Dates are stored Gregorian; Thai UI renders the Buddhist Era calendar (th-TH default). */
export function formatDate(locale: Locale, value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export const today = () => new Date().toISOString().slice(0, 10);

/** Month label for a YYYY-MM-DD month start, e.g. "Mar 2027" / "มี.ค. 2570". */
export function formatMonth(locale: Locale, value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), { month: "short", year: "numeric" }).format(
    date,
  );
}
