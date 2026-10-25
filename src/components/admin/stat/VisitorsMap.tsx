"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LiveVisit } from "@/lib/stat/live-types";
import { countryName, fmtAgo, fmtDuration } from "@/lib/stat/format";
import { MARKER_COLORS } from "./mapColors";

// Infobulle construite en texte brut : chemin, ville et FAI viennent des visiteurs.
function tooltip(v: LiveVisit): HTMLElement {
  const box = document.createElement("div");
  const line = (text: string, strong = false) => {
    const el = document.createElement("div");
    if (strong) el.style.fontWeight = "600";
    el.textContent = text;
    box.appendChild(el);
  };
  const place = [v.city, v.region].filter(Boolean).join(", ");
  line(`${countryName(v.country)}${place ? ` — ${place}` : ""}`, true);
  line(v.visitNumber > 1 ? `Visite n° ${v.visitNumber} · visiteur récurrent` : "Nouveau visiteur");
  if (v.previousVisitAt) line(`Visite précédente ${fmtAgo(new Date(v.previousVisitAt))}`);
  line(`Entrée : ${v.entryPath}`);
  line(`Durée : ${fmtDuration(v.durationSec)} · ${v.pageCount} page${v.pageCount > 1 ? "s" : ""}`);
  if (v.isp) line(`FAI : ${v.isp}`);
  if (v.online) line("● En ligne maintenant");
  return box;
}

export default function VisitorsMap({ visits }: { visits: LiveVisit[] }) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<string, L.CircleMarker>());
  const fitted = useRef(false);

  useEffect(() => {
    if (!holder.current) return;
    const m = L.map(holder.current, { scrollWheelZoom: false, worldCopyJump: true }).setView([46.6, 2.5], 5);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    const known = markers.current;
    return () => {
      m.remove();
      map.current = null;
      layer.current = null;
      known.clear();
      fitted.current = false;
    };
  }, []);

  // Mise à jour en place (pas de clearLayers) : une infobulle ouverte doit
  // survivre au rafraîchissement de 5 s.
  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    const known = markers.current;
    const seen = new Set<string>();
    const points: L.LatLngExpression[] = [];
    for (const v of visits) {
      if (v.lat == null || v.lon == null) continue;
      const ll: L.LatLngExpression = [v.lat, v.lon];
      points.push(ll);
      seen.add(v.id);
      const style = { radius: v.online ? 8 : 6, fillColor: MARKER_COLORS[v.kind] };
      const existing = known.get(v.id);
      if (existing) {
        existing.setStyle(style);
        existing.setRadius(style.radius);
        existing.setTooltipContent(tooltip(v));
      } else {
        const marker = L.circleMarker(ll, { ...style, color: "#fff", weight: 1.5, fillOpacity: 0.9 })
          .bindTooltip(tooltip(v), { direction: "top", offset: [0, -6] })
          .addTo(g);
        known.set(v.id, marker);
      }
      if (v.online) known.get(v.id)!.bringToFront();
    }
    for (const [id, marker] of known) {
      if (!seen.has(id)) {
        g.removeLayer(marker);
        known.delete(id);
      }
    }
    // Cadrage une seule fois : la carte ne doit pas sauter à chaque rafraîchissement.
    if (!fitted.current && points.length > 0) {
      m.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 7 });
      fitted.current = true;
    }
  }, [visits]);

  return <div ref={holder} className="w-full rounded-md overflow-hidden" style={{ height: 380, zIndex: 0, position: "relative" }} />;
}
