import { describe, expect, it } from "vitest";
import {
  defaultAssumptions,
  marketByZone,
  parseLatLng,
  placeQueries,
  isMapsLink,
  readAssumptions,
  residualLandPerWah,
  zoneOf,
  type Competitor,
  type LandPrice,
  type Zone,
} from "@/lib/market";

const zone = (id: string, lat: number, lng: number, radius_m = 2000): Zone => ({
  id,
  name: id,
  center_lat: lat,
  center_lng: lng,
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
  grade: "B",
  price_min: price,
  price_max: price,
  house_area_min: area,
  house_area_max: area,
  land_area_min_wah: null,
  land_area_max_wah: null,
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

describe("readAssumptions", () => {
  it("keeps defaults for blank or silly values", () => {
    const a = readAssumptions({ houseSqm: "300", priceToCost: "9", plotWah: "" });
    expect(a.houseSqm).toBe(300);
    expect(a.priceToCost).toBe(defaultAssumptions.priceToCost);
    expect(a.plotWah).toBe(defaultAssumptions.plotWah);
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
