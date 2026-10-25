import db from "./db";

export interface StatSiteInfo {
  id: string;
  slug: string;
  name: string;
  domains: string[];
}

const TTL_MS = 60_000;
let cache: { at: number; sites: StatSiteInfo[] } | null = null;

export async function listSites(): Promise<StatSiteInfo[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.sites;
  const rows = await db.statSite.findMany({ orderBy: { createdAt: "asc" } });
  const sites = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    domains: safeDomains(r.domains),
  }));
  cache = { at: Date.now(), sites };
  return sites;
}

function safeDomains(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((d): d is string => typeof d === "string") : [];
  } catch {
    return [];
  }
}

export async function siteBySlug(slug: string): Promise<StatSiteInfo | null> {
  return (await listSites()).find((s) => s.slug === slug) ?? null;
}

// Origin doit être exactement https://<domaine déclaré>. En dev seulement,
// http://localhost:* est accepté pour essayer le script en local.
export function originAllowed(
  site: StatSiteInfo,
  origin: string | null,
  dev = process.env.NODE_ENV !== "production"
): boolean {
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false;
  if (dev && url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
    return true;
  }
  return url.protocol === "https:" && url.port === "" && site.domains.includes(url.hostname);
}
