import { createHash } from "node:crypto";

export const TZ = "Europe/Paris";
export const RETENTION_MONTHS = 13;

// Ids stockés = empreinte (site + uuid du navigateur) : jamais l'uuid brut,
// et jamais le même id pour un navigateur d'un site à l'autre.
export function hashId(siteId: string, clientId: string): string {
  return createHash("sha256").update(`${siteId}:${clientId}`).digest("hex").slice(0, 32);
}

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// YYYY-MM-DD en heure de Paris.
export function parisDay(d: Date): string {
  return dayFmt.format(d);
}

export function retentionCutoff(now = new Date()): Date {
  const d = new Date(now);
  d.setMonth(d.getMonth() - RETENTION_MONTHS);
  return d;
}

// Référent externe sans sa query string ; null si interne au site ou illisible.
export function cleanReferrer(
  ref: string | undefined,
  siteDomains: string[]
): { referrer: string; referrerHost: string } | null {
  if (!ref) return null;
  let url: URL;
  try {
    url = new URL(ref);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!host || siteDomains.includes(host)) return null;
  return {
    referrer: `${url.protocol}//${url.host}${url.pathname}`.slice(0, 500),
    referrerHost: host.replace(/^www\./, ""),
  };
}

// Fenêtre glissante d'une minute par clé, gardée en mémoire (instance unique).
export class RateLimiter {
  private hits = new Map<string, { start: number; count: number }>();
  constructor(private max: number, private windowMs = 60_000) {}

  allow(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h || now - h.start >= this.windowMs) {
      if (this.hits.size > 10_000) this.sweep(now);
      this.hits.set(key, { start: now, count: 1 });
      return true;
    }
    h.count++;
    return h.count <= this.max;
  }

  private sweep(now: number) {
    for (const [k, h] of this.hits) if (now - h.start >= this.windowMs) this.hits.delete(k);
  }
}
