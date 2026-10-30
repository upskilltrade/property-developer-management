/** Market intelligence: land prices and competitor projects grouped into zones on the map. */

export const landPriceKinds = ["ASKING", "SOLD", "APPRAISAL"] as const;
export const competitorStatuses = ["SELLING", "SOLD_OUT", "UPCOMING", "UNKNOWN"] as const;
export const competitorGrades = ["A", "B", "C"] as const;
export const productTypes = ["POOL_VILLA", "HOUSE", "TOWNHOME", "CONDO", "LAND", "OTHER"] as const;
/** Things a project gives its buyers, offered as ticks on the competitor form. */
export const offeringOptions = [
  "PRIVATE_POOL",
  "FURNISHED",
  "NO_COMMON_FEE",
  "SEA_VIEW",
  "MOUNTAIN_VIEW",
  "GOLF",
  "CLUBHOUSE",
  "SECURITY_24H",
  "RENTAL_PROGRAM",
  "GUARANTEED_RETURN",
  "FOREIGN_LEASEHOLD",
  "FREEHOLD_COMPANY",
  "SMART_HOME",
  "SOLAR",
  "FREE_TRANSFER",
  "WARRANTY_5Y",
] as const;

export type Zone = {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_m: number;
  notes: string | null;
};
export type LandPrice = {
  id: string;
  lat: number | null;
  lng: number | null;
  location_text: string | null;
  kind: (typeof landPriceKinds)[number];
  price_per_wah: number;
  area_wah: number | null;
  observed_on: string | null;
  source: "MANUAL" | "AI";
  source_url: string | null;
  verified: boolean;
  notes: string | null;
};
export type Competitor = {
  id: string;
  name: string;
  developer: string | null;
  lat: number | null;
  lng: number | null;
  location_text: string | null;
  product_type: string;
  status: string;
  grade: string | null;
  price_min: number | null;
  price_max: number | null;
  house_area_min: number | null;
  house_area_max: number | null;
  land_area_min_wah: number | null;
  land_area_max_wah: number | null;
  bedrooms: string | null;
  units_total: number | null;
  offerings: string[];
  strengths: string | null;
  weaknesses: string | null;
  observed_on: string | null;
  source: "MANUAL" | "AI";
  source_url: string | null;
  verified: boolean;
  notes: string | null;
};

/**
 * The scheme we would build, used to work back to the most we can pay for land.
 * Defaults follow Monteva Hua Hin: a 220 sq.m. pool villa on about 150 ตร.ว., house + interior
 * about 30,000 baht/sq.m., roads and utilities about 750,000 baht a plot.
 */
export type Assumptions = {
  houseSqm: number;
  plotWah: number;
  buildPerSqm: number;
  infraPerPlot: number;
  /** Selling, transfer and tax costs as a share of the sale price. */
  sellingPct: number;
  /** Sale price ÷ total cost the deal must reach (the cost checklist asks 1.25–1.35). */
  priceToCost: number;
  /** How far below asking prices land usually changes hands. */
  negotiationPct: number;
};
export const defaultAssumptions: Assumptions = {
  houseSqm: 220,
  plotWah: 150,
  buildPerSqm: 30000,
  infraPerPlot: 750000,
  sellingPct: 15,
  priceToCost: 1.3,
  negotiationPct: 10,
};

const num = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/** Reads assumptions from search params, keeping the default for anything blank or out of range. */
export function readAssumptions(q: Record<string, string | undefined>): Assumptions {
  const pick = (key: keyof Assumptions, min: number, max: number) => {
    const v = num(q[key]);
    return v != null && v >= min && v <= max ? v : defaultAssumptions[key];
  };
  return {
    houseSqm: pick("houseSqm", 20, 5000),
    plotWah: pick("plotWah", 10, 10000),
    buildPerSqm: pick("buildPerSqm", 1000, 500000),
    infraPerPlot: pick("infraPerPlot", 0, 100000000),
    sellingPct: pick("sellingPct", 0, 60),
    priceToCost: pick("priceToCost", 1, 3),
    negotiationPct: pick("negotiationPct", 0, 60),
  };
}

/**
 * A coordinate typed or pasted from Google Maps: "12.5684, 99.9577", "12.5684 99.9577", or a full
 * maps URL carrying it ("@12.5684,99.9577", "q=12.5684,99.9577", "!3d12.5684!4d99.9577",
 * "/search/12.5684,+99.9577"). The pin itself ("!3d…!4d…") wins over the map's view centre ("@…").
 * Short share links (maps.app.goo.gl) carry no coordinate; they are resolved on the server.
 */
export function parseLatLng(text: string): { lat: number; lng: number } | null {
  let t = text.trim();
  if (!t) return null;
  try {
    t = decodeURIComponent(t);
  } catch {
    // keep the text as typed
  }
  const m =
    t.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/) ??
    t.match(/[?&](?:q|query|ll|center|destination)=(-?\d{1,2}\.\d+),\s*\+?(-?\d{1,3}\.\d+)/) ??
    t.match(/\/search\/(-?\d{1,2}\.\d+),\s*\+?(-?\d{1,3}\.\d+)/) ??
    t.match(/@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) ??
    t.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** Whether the text is a Google Maps link that may need following to find its coordinate. */
export function isMapsLink(text: string) {
  try {
    const u = new URL(text.trim());
    return (
      u.protocol === "https:" &&
      (mapsHosts.has(u.hostname) ||
        (u.hostname.endsWith(".google.com") && u.pathname.startsWith("/maps")))
    );
  } catch {
    return false;
  }
}
export const mapsHosts = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "maps.google.com",
  "www.google.com",
  "google.com",
  "www.google.co.th",
  "maps.google.co.th",
]);

/**
 * Place names to look up for a project, most exact first: the project with its location, the
 * project alone, then each area in a location like "Nong Kae / Khao Tao, Hua Hin", then the town.
 */
export function placeQueries(name: string, location: string | null) {
  const loc = (location ?? "").trim();
  const [areas = "", ...rest] = loc.split(",");
  const town = rest.join(",").trim();
  const parts = areas
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean);
  const exact = [loc ? `${name}, ${loc}` : name, ...(loc ? [name] : [])];
  const approx = [...parts.map((x) => (town ? `${x}, ${town}` : x)), ...(town ? [town] : [])];
  return { exact, approx: [...new Set(approx)] };
}

/** Great-circle distance in metres. */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = 6371000;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** The nearest zone whose circle holds the point, or null. */
export function zoneOf(lat: number | null, lng: number | null, zones: Zone[]) {
  if (lat == null || lng == null) return null;
  let best: { zone: Zone; d: number } | null = null;
  for (const z of zones) {
    const d = distanceM(lat, lng, z.center_lat, z.center_lng);
    if (d <= z.radius_m && (!best || d < best.d)) best = { zone: z, d };
  }
  return best?.zone ?? null;
}

export function median(values: number[]) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const mid = (a: number | null, b: number | null) =>
  a != null && b != null ? (a + b) / 2 : (a ?? b ?? null);

/** A competitor's typical price and price per sq.m. of house, from the middle of its ranges. */
export function competitorPrice(c: Competitor) {
  const price = mid(c.price_min, c.price_max);
  const area = mid(c.house_area_min, c.house_area_max);
  return { price, perSqm: price != null && area ? price / area : null };
}

/**
 * The most we can pay per ตร.ว. and still sell at `salePrice` with sale ÷ cost ≥ priceToCost:
 * land ≤ sale ÷ ratio − build − infrastructure − selling costs, spread over the plot.
 */
export function residualLandPerWah(salePrice: number, a: Assumptions) {
  const land =
    salePrice / a.priceToCost -
    a.buildPerSqm * a.houseSqm -
    a.infraPerPlot -
    salePrice * (a.sellingPct / 100);
  return land / a.plotWah;
}

export type Opportunity = "GOOD" | "FAIR" | "WEAK" | "NO_DATA";

export type ZoneStats = {
  zone: Zone | null;
  lands: LandPrice[];
  competitors: Competitor[];
  /** Median of asking and sold prices (baht per ตร.ว.). */
  landMedian: number | null;
  soldMedian: number | null;
  appraisalMedian: number | null;
  /** What land in the zone really costs: sold prices, else asking less the usual discount. */
  marketLand: number | null;
  sellingCount: number;
  compPriceMedian: number | null;
  compPerSqmMedian: number | null;
  grades: Record<string, number>;
  /** Our sale price if we priced at the zone's median per sq.m. */
  ourSalePrice: number | null;
  residualPerWah: number | null;
  /** The price to aim for: the lower of what the market charges and what our numbers allow. */
  targetPerWah: number | null;
  /** How much room the residual leaves over the market price (residual ÷ market − 1). */
  headroomPct: number | null;
  opportunity: Opportunity;
};

export function zoneStats(
  zone: Zone | null,
  lands: LandPrice[],
  competitors: Competitor[],
  a: Assumptions,
): ZoneStats {
  const market = lands.filter((l) => l.kind !== "APPRAISAL");
  const landMedian = median(market.map((l) => Number(l.price_per_wah)));
  const soldMedian = median(
    lands.filter((l) => l.kind === "SOLD").map((l) => Number(l.price_per_wah)),
  );
  const appraisalMedian = median(
    lands.filter((l) => l.kind === "APPRAISAL").map((l) => Number(l.price_per_wah)),
  );
  const askingMedian = median(
    lands.filter((l) => l.kind === "ASKING").map((l) => Number(l.price_per_wah)),
  );
  const marketLand =
    soldMedian ?? (askingMedian != null ? askingMedian * (1 - a.negotiationPct / 100) : null);

  const priced = competitors.map(competitorPrice);
  const compPriceMedian = median(priced.map((p) => p.price ?? NaN));
  const compPerSqmMedian = median(priced.map((p) => p.perSqm ?? NaN));
  const grades: Record<string, number> = {};
  for (const c of competitors) if (c.grade) grades[c.grade] = (grades[c.grade] ?? 0) + 1;

  const ourSalePrice = compPerSqmMedian != null ? compPerSqmMedian * a.houseSqm : null;
  const residualPerWah = ourSalePrice != null ? residualLandPerWah(ourSalePrice, a) : null;
  const targetPerWah =
    residualPerWah != null && marketLand != null
      ? Math.max(0, Math.min(residualPerWah, marketLand))
      : (residualPerWah ?? marketLand);
  const headroomPct =
    residualPerWah != null && marketLand ? (residualPerWah / marketLand - 1) * 100 : null;
  const opportunity: Opportunity =
    headroomPct == null
      ? "NO_DATA"
      : headroomPct >= 15
        ? "GOOD"
        : headroomPct >= 0
          ? "FAIR"
          : "WEAK";

  return {
    zone,
    lands,
    competitors,
    landMedian,
    soldMedian,
    appraisalMedian,
    marketLand,
    sellingCount: competitors.filter((c) => c.status === "SELLING").length,
    compPriceMedian,
    compPerSqmMedian,
    grades,
    ourSalePrice,
    residualPerWah,
    targetPerWah,
    headroomPct,
    opportunity,
  };
}

/** Stats for every zone plus one bucket (zone null) for points outside all zones; best first. */
export function marketByZone(
  zones: Zone[],
  lands: LandPrice[],
  competitors: Competitor[],
  a: Assumptions,
) {
  const bucket = new Map<string | null, { lands: LandPrice[]; comps: Competitor[] }>();
  for (const z of zones) bucket.set(z.id, { lands: [], comps: [] });
  bucket.set(null, { lands: [], comps: [] });
  for (const l of lands) bucket.get(zoneOf(l.lat, l.lng, zones)?.id ?? null)!.lands.push(l);
  for (const c of competitors) bucket.get(zoneOf(c.lat, c.lng, zones)?.id ?? null)!.comps.push(c);
  const rank: Record<Opportunity, number> = { GOOD: 0, FAIR: 1, WEAK: 2, NO_DATA: 3 };
  const stats = zones.map((z) => {
    const b = bucket.get(z.id)!;
    return zoneStats(z, b.lands, b.comps, a);
  });
  stats.sort(
    (x, y) =>
      rank[x.opportunity] - rank[y.opportunity] ||
      (y.headroomPct ?? -1e9) - (x.headroomPct ?? -1e9),
  );
  const outside = bucket.get(null)!;
  return { zones: stats, outside: zoneStats(null, outside.lands, outside.comps, a) };
}

export const opportunityTone = {
  GOOD: "success",
  FAIR: "warning",
  WEAK: "danger",
  NO_DATA: "neutral",
} as const;
export const gradeTone = { A: "success", B: "info", C: "neutral" } as const;
