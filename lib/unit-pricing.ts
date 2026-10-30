/** Default charge for each ตารางวา a plot has above the standard plot. */
export const defaultExtraLandPerWah = 25000;
export const sqmPerWah = 4;

/**
 * Suggested list price: the base price (standard house on the smallest plot) plus the
 * extra land, charged per ตร.ว., rounded to the nearest 10,000 baht.
 */
export function suggestedPrice(
  base: number,
  plotSqm: number | null,
  standardSqm: number | null,
  perWah: number,
) {
  if (plotSqm == null || standardSqm == null) return base;
  const extraWah = Math.max(0, plotSqm - standardSqm) / sqmPerWah;
  return Math.round((base + extraWah * perWah) / 10000) * 10000;
}
