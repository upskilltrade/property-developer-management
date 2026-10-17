import "server-only";
import { toLocale, type Locale } from "./config";
import th, { type Dictionary } from "./dictionaries/th";
import en from "./dictionaries/en";

const dictionaries: Record<Locale, Dictionary> = { th, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/** Resolves the route locale param and its dictionary in one call. */
export async function resolveLocale(params: Promise<{ locale: string }>) {
  const locale = toLocale((await params).locale);
  return { locale, t: getDictionary(locale) };
}

export type { Dictionary, Locale };
