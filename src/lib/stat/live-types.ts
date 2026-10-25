// Types partagés entre /api/admin/stat/live et le panneau client (aucune dépendance serveur).

export type MarkerKind = "nouveau" | "recurrent" | "en-ligne";

export interface LiveVisit {
  id: string;
  startedAt: string; // ISO
  lastSeenAt: string; // ISO
  online: boolean;
  visitNumber: number;
  previousVisitAt: string | null; // ISO
  referrerHost: string | null;
  entryPath: string;
  pageCount: number;
  durationSec: number;
  country: string | null;
  region: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  isp: string | null;
  os: string | null;
  browser: string | null;
  deviceType: string;
  isBot: boolean;
  kind: MarkerKind;
}

export interface LiveData {
  generatedAt: string; // ISO
  online: number;
  visits: LiveVisit[]; // 50 dernières visites
  map: LiveVisit[]; // visites récentes géolocalisées
  flags: Record<string, string>; // code pays → SVG, seulement ceux affichés
}
