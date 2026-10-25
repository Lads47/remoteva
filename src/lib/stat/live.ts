import * as flagSvgs from "country-flag-icons/string/3x2";
import db, { ensureWal } from "./db";
import type { LiveData, LiveVisit, MarkerKind } from "./live-types";

export const ONLINE_MS = 2 * 60 * 1000;
const TABLE_SIZE = 50;
const MAP_SIZE = 150;

export function markerKind(v: { lastSeenAt: Date; visitNumber: number }, now: Date): MarkerKind {
  if (now.getTime() - v.lastSeenAt.getTime() < ONLINE_MS) return "en-ligne";
  return v.visitNumber > 1 ? "recurrent" : "nouveau";
}

// Pour chaque visite, le début de la visite précédente du même visiteur.
export function previousVisitStarts(
  targets: { id: string; visitorId: string; startedAt: Date }[],
  history: { visitorId: string; startedAt: Date }[]
): Map<string, Date | null> {
  const byVisitor = new Map<string, number[]>();
  for (const h of history) {
    const list = byVisitor.get(h.visitorId) ?? [];
    list.push(h.startedAt.getTime());
    byVisitor.set(h.visitorId, list);
  }
  const out = new Map<string, Date | null>();
  for (const t of targets) {
    const before = (byVisitor.get(t.visitorId) ?? []).filter((s) => s < t.startedAt.getTime());
    out.set(t.id, before.length ? new Date(Math.max(...before)) : null);
  }
  return out;
}

const SELECT = {
  id: true, visitorId: true, startedAt: true, lastSeenAt: true, visitNumber: true,
  referrerHost: true, entryPath: true, pageCount: true, durationSec: true,
  country: true, region: true, city: true, lat: true, lon: true, isp: true,
  os: true, browser: true, deviceType: true, isBot: true,
} as const;

export async function getLive(siteId: string, bots: boolean, now = new Date()): Promise<LiveData> {
  await ensureWal();
  const humans = bots ? {} : { isBot: false };

  const [online, recent, mapped] = await Promise.all([
    db.statVisit.count({ where: { siteId, ...humans, lastSeenAt: { gte: new Date(now.getTime() - ONLINE_MS) } } }),
    db.statVisit.findMany({ where: { siteId, ...humans }, orderBy: { startedAt: "desc" }, take: TABLE_SIZE, select: SELECT }),
    db.statVisit.findMany({
      where: { siteId, ...humans, lat: { not: null }, lon: { not: null } },
      orderBy: { lastSeenAt: "desc" },
      take: MAP_SIZE,
      select: SELECT,
    }),
  ]);

  const all = new Map([...recent, ...mapped].map((v) => [v.id, v]));
  const returning = [...all.values()].filter((v) => v.visitNumber > 1);
  const history = returning.length
    ? await db.statVisit.findMany({
        where: { visitorId: { in: [...new Set(returning.map((v) => v.visitorId))] } },
        select: { visitorId: true, startedAt: true },
      })
    : [];
  const previous = previousVisitStarts(returning, history);

  // L'identifiant du visiteur ne quitte pas le serveur.
  const toLive = (v: (typeof recent)[number]): LiveVisit => ({
    id: v.id,
    startedAt: v.startedAt.toISOString(),
    lastSeenAt: v.lastSeenAt.toISOString(),
    online: now.getTime() - v.lastSeenAt.getTime() < ONLINE_MS,
    visitNumber: v.visitNumber,
    previousVisitAt: previous.get(v.id)?.toISOString() ?? null,
    referrerHost: v.referrerHost,
    entryPath: v.entryPath,
    pageCount: v.pageCount,
    durationSec: v.durationSec,
    country: v.country,
    region: v.region,
    city: v.city,
    lat: v.lat,
    lon: v.lon,
    isp: v.isp,
    os: v.os,
    browser: v.browser,
    deviceType: v.deviceType,
    isBot: v.isBot,
    kind: markerKind(v, now),
  });

  const visits = recent.map(toLive);
  const map = mapped.map(toLive);
  const flags: Record<string, string> = {};
  for (const v of visits) {
    const code = v.country?.toUpperCase();
    const svg = code ? (flagSvgs as Record<string, string>)[code] : undefined;
    if (code && svg) flags[code] = svg;
  }

  return { generatedAt: now.toISOString(), online, visits, map, flags };
}
