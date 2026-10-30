import "server-only";
import { isMapsLink, mapsHosts, parseLatLng } from "@/lib/market";

type Point = { lat: number; lng: number };

/**
 * A coordinate from what someone typed: plain numbers, a full Google Maps URL, or a share link
 * (maps.app.goo.gl/…) followed through its redirects. Only Google Maps hosts are ever fetched.
 */
export async function resolveCoordinate(text: string): Promise<Point | null> {
  const direct = parseLatLng(text);
  if (direct || !isMapsLink(text)) return direct;
  let url = text.trim();
  for (let hop = 0; hop < 5; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        headers: { "user-agent": "Mozilla/5.0 (compatible; DevPropertyPro)" },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return null;
    }
    const next = res.headers.get("location");
    if (next) {
      const target = new URL(next, url);
      const found = parseLatLng(target.toString());
      if (found) return found;
      const allowed =
        target.protocol === "https:" &&
        (mapsHosts.has(target.hostname) || target.hostname.endsWith(".google.com"));
      if (!allowed) return null;
      url = target.toString();
      continue;
    }
    if (!res.ok) return null;
    // The final page names the place's centre in its preview image or map state.
    const html = (await res.text()).slice(0, 400_000);
    const m =
      html.match(/center=(-?\d{1,2}\.\d+)%2C(-?\d{1,3}\.\d+)/) ??
      html.match(/\[null,null,(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)\]/);
    return m ? parseLatLng(`${m[1]}, ${m[2]}`) : null;
  }
  return null;
}

/**
 * Finds a place by name with OpenStreetMap's Nominatim, limited to Thailand. Returns null when
 * nothing matches. Nominatim allows about one request a second, so callers space their calls.
 */
export async function geocode(query: string): Promise<(Point & { label: string }) | null> {
  const q = query.trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q,
    format: "jsonv2",
    limit: "1",
    countrycodes: "th",
  })}`;
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "DevPropertyPro/1.0 (property market map)",
        "accept-language": "th,en",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    const r = rows[0];
    if (!r) return null;
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    return Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng, label: r.display_name }
      : null;
  } catch {
    return null;
  }
}

export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
