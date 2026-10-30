"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";

export type MapZone = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number;
  tone: "GOOD" | "FAIR" | "WEAK" | "NO_DATA";
  label: string;
};
export type MapPoint = {
  id: string;
  kind: "land" | "competitor";
  lat: number;
  lng: number;
  title: string;
  detail: string;
  grade?: string | null;
  verified: boolean;
};

const zoneColor = { GOOD: "#059669", FAIR: "#d97706", WEAK: "#dc2626", NO_DATA: "#64748b" };
const gradeColor: Record<string, string> = { A: "#7c3aed", B: "#2563eb", C: "#64748b" };
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/**
 * Street / satellite map of zones (circles coloured by opportunity), land price points (squares)
 * and competitor projects (dots coloured by grade). A click shows the coordinate to paste into a form.
 */
export function MarketMap({
  zones,
  points,
  labels,
  center,
}: {
  zones: MapZone[];
  points: MapPoint[];
  labels: {
    street: string;
    satellite: string;
    coordinate: string;
    copy: string;
    unverified: string;
  };
  center: { lat: number; lng: number };
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      map.current?.remove();
      const m = L.map(el.current, { scrollWheelZoom: true }).setView([center.lat, center.lng], 12);
      map.current = m;
      const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(m);
      const satellite = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19, attribution: "&copy; Esri" },
      );
      L.control.layers({ [labels.street]: street, [labels.satellite]: satellite }).addTo(m);

      const bounds = L.latLngBounds([]);
      for (const z of zones) {
        const c = L.circle([z.lat, z.lng], {
          radius: z.radius,
          color: zoneColor[z.tone],
          weight: 2,
          fillOpacity: 0.08,
        }).addTo(m);
        c.bindTooltip(`<b>${esc(z.name)}</b><br>${esc(z.label)}`, { sticky: true });
        bounds.extend(c.getBounds());
      }
      for (const p of points) {
        const color = p.kind === "land" ? "#0f766e" : (gradeColor[p.grade ?? ""] ?? "#2563eb");
        const marker =
          p.kind === "land"
            ? L.rectangle(
                [
                  [p.lat - 0.0007, p.lng - 0.0007],
                  [p.lat + 0.0007, p.lng + 0.0007],
                ],
                { color, weight: 1, fillOpacity: 0.8 },
              )
            : L.circleMarker([p.lat, p.lng], {
                radius: 7,
                color: "#fff",
                weight: 2,
                fillColor: color,
                fillOpacity: p.verified ? 0.95 : 0.45,
              });
        marker
          .addTo(m)
          .bindPopup(
            `<b>${esc(p.title)}</b><br>${esc(p.detail)}${p.verified ? "" : `<br><i>${esc(labels.unverified)}</i>`}`,
          );
        bounds.extend([p.lat, p.lng]);
      }
      if (bounds.isValid()) m.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
      m.on("click", (e) => setPicked(`${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`));
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [zones, points, labels, center.lat, center.lng]);

  return (
    <div className="relative">
      <div ref={el} className="z-0 h-[420px] w-full rounded-b-lg lg:h-[520px]" />
      {picked ? (
        <div className="absolute bottom-3 left-3 z-[500] flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-2xs shadow">
          <span className="text-muted">{labels.coordinate}</span>
          <span className="num font-medium">{picked}</span>
          <button
            type="button"
            className="font-medium text-brand hover:underline"
            onClick={() => navigator.clipboard?.writeText(picked)}
          >
            {labels.copy}
          </button>
        </div>
      ) : null}
    </div>
  );
}
