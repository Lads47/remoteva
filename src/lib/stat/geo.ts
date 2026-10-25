import fs from "node:fs";
import path from "node:path";
import maxmind, { type AsnResponse, type CityResponse, type Reader } from "maxmind";
import { GEO_DIR } from "./paths";

// Géolocalisation locale (DB-IP Lite, CC BY 4.0) : aucune IP ne quitte le serveur.
// Base absente → on mesure quand même, sans lieu ni FAI.

export interface GeoInfo {
  country?: string;
  region?: string;
  city?: string;
  lat?: number;
  lon?: number;
  isp?: string;
}

export const CITY_FILE = "dbip-city-lite.mmdb";
export const ASN_FILE = "dbip-asn-lite.mmdb";
const RECHECK_MS = 10 * 60 * 1000;

interface Slot<T extends CityResponse | AsnResponse> {
  reader: Reader<T> | null;
  mtimeMs: number;
  checkedAt: number;
  loading: Promise<void> | null;
}

const city: Slot<CityResponse> = { reader: null, mtimeMs: 0, checkedAt: 0, loading: null };
const asn: Slot<AsnResponse> = { reader: null, mtimeMs: 0, checkedAt: 0, loading: null };

// Rouvre la base quand le fichier change (mise à jour mensuelle) sans redémarrer.
async function refresh<T extends CityResponse | AsnResponse>(slot: Slot<T>, file: string) {
  const now = Date.now();
  if (now - slot.checkedAt < RECHECK_MS) return;
  if (slot.loading) return slot.loading;
  slot.checkedAt = now;
  slot.loading = (async () => {
    try {
      const full = path.join(GEO_DIR, file);
      const stat = await fs.promises.stat(full);
      if (!slot.reader || stat.mtimeMs !== slot.mtimeMs) {
        slot.reader = await maxmind.open<T>(full);
        slot.mtimeMs = stat.mtimeMs;
      }
    } catch {
      slot.reader = null;
    } finally {
      slot.loading = null;
    }
  })();
  return slot.loading;
}

function round2(n: number | undefined): number | undefined {
  return typeof n === "number" ? Math.round(n * 100) / 100 : undefined;
}

type Names = { fr?: string; en?: string } | undefined;
const pick = (names: Names) => names?.fr || names?.en || undefined;

export async function lookupGeo(ip: string | null): Promise<GeoInfo> {
  if (!ip) return {};
  await Promise.all([refresh(city, CITY_FILE), refresh(asn, ASN_FILE)]);
  const out: GeoInfo = {};
  try {
    const c = city.reader?.get(ip);
    if (c) {
      out.country = c.country?.iso_code;
      out.region = pick(c.subdivisions?.[0]?.names as Names);
      out.city = pick(c.city?.names as Names);
      out.lat = round2(c.location?.latitude);
      out.lon = round2(c.location?.longitude);
    }
    const a = asn.reader?.get(ip);
    if (a?.autonomous_system_organization) out.isp = a.autonomous_system_organization;
  } catch {
    // IP non couverte par la base : pas de lieu.
  }
  return out;
}
