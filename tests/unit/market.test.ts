import { describe, expect, it } from "vitest";
import {
  defaultAssumptions,
  marketByZone,
  parseLatLng,
  placeQueries,
  isMapsLink,
  readAssumptions,
  residualLandPerWah,
  zoneArea,
  zoneMatches,
  zoneOf,
  parseAliases,
  type Competitor,
  type LandPrice,
  type Zone,
} from "@/lib/market";

const zone = (
  id: string,
  lat: number | null,
  lng: number | null,
  radius_m = 2000,
  parent_id: string | null = null,
): Zone => ({
  id,
  parent_id,
  name: id,
  name_en: null,
  slug: id,
  aliases: [],
  sort_order: 0,
  geocode_hint: null,
  center_lat: lat,
  center_lng: lng,
  center_source: null,
  radius_m,
  notes: null,
});
const land = (
  lat: number,
  lng: number,
  price: number,
  kind: LandPrice["kind"] = "ASKING",
): LandPrice => ({
  id: `${lat}-${price}`,
  lat,
  lng,
  location_text: null,
  zone_id: null,
  kind,
  price_per_wah: price,
  area_wah: null,
  observed_on: null,
  source: "MANUAL",
  source_url: null,
  verified: true,
  notes: null,
});
const comp = (lat: number, lng: number, price: number, area: number): Competitor => ({
  id: `${lat}-${price}`,
  name: "X",
  developer: null,
  lat,
  lng,
  location_text: null,
  product_type: "POOL_VILLA",
  status: "SELLING",
  grade: "A",
  price_min: price,
  price_max: price,
  house_area_min: area,
  house_area_max: area,
  land_area_min_wah: null,
  land_area_max_wah: null,
  zone_id: null,
  bedrooms: null,
  units_total: null,
  offerings: [],
  strengths: null,
  weaknesses: null,
  observed_on: null,
  source: "MANUAL",
  source_url: null,
  verified: true,
  notes: null,
});

describe("parseLatLng", () => {
  it("reads typed and Google Maps coordinates", () => {
    expect(parseLatLng("12.5684, 99.9577")).toEqual({ lat: 12.5684, lng: 99.9577 });
    expect(parseLatLng("12.5684 99.9577")).toEqual({ lat: 12.5684, lng: 99.9577 });
    expect(parseLatLng("https://www.google.com/maps/place/x/@12.5684,99.9577,17z")).toEqual({
      lat: 12.5684,
      lng: 99.9577,
    });
    expect(parseLatLng("https://maps.google.com/?q=12.57,99.95")).toEqual({
      lat: 12.57,
      lng: 99.95,
    });
  });
  it("prefers the pin over the view centre and reads encoded links", () => {
    expect(
      parseLatLng(
        "https://www.google.com/maps/place/X/@12.50,99.90,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d12.5123!4d99.9456",
      ),
    ).toEqual({ lat: 12.5123, lng: 99.9456 });
    expect(parseLatLng("https://maps.google.com/maps?q=12.57%2C99.95")).toEqual({
      lat: 12.57,
      lng: 99.95,
    });
    expect(parseLatLng("https://www.google.com/maps/search/12.57,+99.95")).toEqual({
      lat: 12.57,
      lng: 99.95,
    });
  });
  it("knows a share link needs following", () => {
    expect(parseLatLng("https://maps.app.goo.gl/AbC123")).toBeNull();
    expect(isMapsLink("https://maps.app.goo.gl/AbC123")).toBe(true);
    expect(isMapsLink("https://example.com/maps")).toBe(false);
  });
  it("rejects anything else", () => {
    expect(parseLatLng("")).toBeNull();
    expect(parseLatLng("หัวหิน")).toBeNull();
    expect(parseLatLng("120, 99")).toBeNull();
  });
});

describe("zones", () => {
  it("puts a point in the nearest zone that holds it", () => {
    const zones = [zone("a", 12.57, 99.95, 3000), zone("b", 12.58, 99.95, 3000)];
    expect(zoneOf(12.579, 99.95, zones)?.id).toBe("b");
    expect(zoneOf(13.5, 99.95, zones)).toBeNull();
    expect(zoneOf(null, 99.95, zones)).toBeNull();
  });
});

describe("residual land value", () => {
  it("matches the Monteva scheme", () => {
    // 15M ÷ 1.3 − 6.6M build − 0.75M roads − 2.25M selling = 1.94M over 150 ตร.ว.
    expect(Math.round(residualLandPerWah(15_000_000, defaultAssumptions))).toBe(12923);
  });
});

describe("marketByZone", () => {
  it("ranks a zone with room over land prices first", () => {
    const zones = [zone("cheap", 12.5, 99.9), zone("dear", 12.6, 99.9)];
    const lands = [
      land(12.5, 99.9, 8000),
      land(12.5, 99.9, 10000),
      land(12.6, 99.9, 30000, "SOLD"),
      land(12.6, 99.9, 5000, "APPRAISAL"),
      land(14, 100, 1000),
    ];
    const comps = [comp(12.5, 99.9, 15_000_000, 220), comp(12.6, 99.9, 15_000_000, 220)];
    const { zones: stats, outside } = marketByZone(zones, lands, comps, defaultAssumptions);
    expect(stats.map((s) => s.zone?.id)).toEqual(["cheap", "dear"]);
    const cheap = stats[0];
    expect(cheap.landMedian).toBe(9000);
    expect(cheap.marketLand).toBe(8100); // asking less 10%
    expect(cheap.opportunity).toBe("GOOD");
    expect(cheap.targetPerWah).toBe(8100);
    const dear = stats[1];
    expect(dear.marketLand).toBe(30000); // sold prices win, appraisal ignored
    expect(dear.appraisalMedian).toBe(5000);
    expect(dear.opportunity).toBe("WEAK");
    expect(outside.lands).toHaveLength(1);
  });
  it("reports no data without both prices", () => {
    const { zones: stats } = marketByZone(
      [zone("z", 1, 1)],
      [land(1, 1, 5000)],
      [],
      defaultAssumptions,
    );
    expect(stats[0].opportunity).toBe("NO_DATA");
    expect(stats[0].targetPerWah).toBe(4500);
  });
});

describe("comparables", () => {
  it("prices our scheme only against projects like ours, and never targets below zero", () => {
    const cheap = {
      ...comp(1, 1, 2_000_000, 120),
      product_type: "HOUSE" as const,
      grade: "C" as const,
    };
    const villa = comp(1, 1, 15_000_000, 220);
    const { outside } = marketByZone([], [], [cheap, villa], defaultAssumptions);
    expect(outside.comparables).toEqual([villa]);
    expect(outside.compPerSqmMedian).toBeCloseTo(15_000_000 / 220);
    const all = marketByZone([], [], [cheap], {
      ...defaultAssumptions,
      compareType: "ALL",
      compareGrade: "ALL",
    });
    expect(all.outside.residualPerWah!).toBeLessThan(0);
    expect(all.outside.targetPerWah).toBe(0);
  });
});

describe("zone tree", () => {
  it("rolls sub zones up into their main zone and lets a hand-picked zone win", () => {
    const main = zone("hua-hin", null, null, 5000);
    const a = zone("black-mountain", 12.5, 99.9, 1500, "hua-hin");
    const b = zone("khao-takiab", 12.6, 99.9, 1500, "hua-hin");
    const other = zone("cha-am", null, null);
    const zones = [main, a, b, other];
    const lands = [
      land(12.5, 99.9, 8000),
      land(12.6, 99.9, 9000),
      { ...land(14, 100, 5000), zone_id: "cha-am" },
    ];
    const { zones: mains, subs, outside } = marketByZone(zones, lands, [], defaultAssumptions);
    const hh = mains.find((s) => s.zone?.id === "hua-hin")!;
    expect(hh.lands).toHaveLength(2);
    expect(subs.map((s) => s.zone?.id).sort()).toEqual(["black-mountain", "khao-takiab"]);
    expect(mains.find((s) => s.zone?.id === "cha-am")!.lands).toHaveLength(1);
    expect(outside.lands).toHaveLength(0);
  });
  it("prefers the smallest circle and skips zones with no centre", () => {
    const big = zone("big", 12.5, 99.9, 5000);
    const small = zone("small", 12.51, 99.9, 1500, "big");
    expect(zoneOf(12.505, 99.9, [big, small])?.id).toBe("small");
    expect(zoneOf(12.5, 99.9, [zone("none", null, null)])).toBeNull();
  });
  it("draws a main zone with no centre over its located sub zones", () => {
    const main = zone("m", null, null);
    const area = zoneArea(main, [
      main,
      zone("s", 12.5, 99.9, 1000, "m"),
      zone("t", 12.52, 99.9, 1000, "m"),
    ]);
    expect(area?.lat).toBeCloseTo(12.51);
    expect(area!.radius).toBeGreaterThan(1000);
    expect(zoneArea(main, [main])).toBeNull();
  });
  it("finds zones by any name and cleans typed aliases", () => {
    const z = {
      ...zone("x", null, null),
      name: "แบล็คเมาน์เทน",
      name_en: "Black Mountain",
      aliases: ["BM Hua Hin"],
    };
    expect(zoneMatches(z, "black")).toBe(true);
    expect(zoneMatches(z, "bm hua")).toBe(true);
    expect(zoneMatches(z, "takiab")).toBe(false);
    expect(parseAliases(" A, B\nA ; ")).toEqual(["A", "B"]);
  });
});

describe("readAssumptions", () => {
  it("keeps defaults for blank or silly values", () => {
    const a = readAssumptions({ houseSqm: "300", priceToCost: "9", plotWah: "" });
    expect(a.houseSqm).toBe(300);
    expect(a.priceToCost).toBe(defaultAssumptions.priceToCost);
    expect(a.plotWah).toBe(defaultAssumptions.plotWah);
    expect(readAssumptions({ compareType: "ALL", compareGrade: "Z" })).toMatchObject({
      compareType: "ALL",
      compareGrade: "A",
    });
  });
});

describe("placeQueries", () => {
  it("tries the project, then each area, then the town", () => {
    expect(placeQueries("The Sky 126", "Nong Kae / Khao Tao, Hua Hin")).toEqual({
      exact: ["The Sky 126, Nong Kae / Khao Tao, Hua Hin", "The Sky 126"],
      approx: ["Nong Kae, Hua Hin", "Khao Tao, Hua Hin", "Hua Hin"],
    });
    expect(placeQueries("X", null)).toEqual({ exact: ["X"], approx: [] });
  });
});
