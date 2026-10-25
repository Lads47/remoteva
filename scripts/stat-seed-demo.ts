// EVA Stat — données fictives pour essayer le tableau de bord EN LOCAL.
// Usage : npx tsx scripts/stat-seed-demo.ts   (vide les tables stat_* d'abord)
// JAMAIS en production : refuse de tourner si NODE_ENV=production.

import { PrismaClient } from "../src/generated/prisma-stat/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { createHash, randomUUID } from "crypto";
import path from "path";

if (process.env.NODE_ENV === "production") {
  console.error("Refus : script de démo, pas pour la production.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${path.join(process.cwd(), "data", "stat", "stat.db")}` }) });
const hash = (s: string, c: string) => createHash("sha256").update(`${s}:${c}`).digest("hex").slice(0, 32);
const pickW = <T,>(items: [T, number][]): T => {
  let r = Math.random() * items.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of items) if ((r -= w) <= 0) return v;
  return items[0][0];
};
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });

const PLACES: [{ country: string; region: string; city: string; lat: number; lon: number; isp: string }, number][] = [
  [{ country: "FR", region: "Nouvelle-Aquitaine", city: "Marmande", lat: 44.5, lon: 0.17, isp: "Orange S.A." }, 12],
  [{ country: "FR", region: "Nouvelle-Aquitaine", city: "Bordeaux", lat: 44.84, lon: -0.58, isp: "Free SAS" }, 14],
  [{ country: "FR", region: "Nouvelle-Aquitaine", city: "Agen", lat: 44.2, lon: 0.62, isp: "SFR SA" }, 8],
  [{ country: "FR", region: "Île-de-France", city: "Paris", lat: 48.86, lon: 2.35, isp: "Bouygues Telecom SA" }, 20],
  [{ country: "FR", region: "Occitanie", city: "Toulouse", lat: 43.6, lon: 1.44, isp: "Orange S.A." }, 9],
  [{ country: "FR", region: "Auvergne-Rhône-Alpes", city: "Lyon", lat: 45.76, lon: 4.84, isp: "Free SAS" }, 8],
  [{ country: "BE", region: "Bruxelles-Capitale", city: "Bruxelles", lat: 50.85, lon: 4.35, isp: "Proximus NV" }, 3],
  [{ country: "CH", region: "Genève", city: "Genève", lat: 46.2, lon: 6.14, isp: "Swisscom (Schweiz) AG" }, 2],
  [{ country: "CA", region: "Québec", city: "Montréal", lat: 45.5, lon: -73.57, isp: "Videotron Ltee" }, 2],
  [{ country: "US", region: "California", city: "San Francisco", lat: 37.77, lon: -122.42, isp: "Comcast Cable" }, 1],
];

const SITES: Record<string, { pages: string[]; volume: number; events: string[] }> = {
  stat_site_lads: { pages: ["/", "/formations", "/formations/ia", "/formations/vmix", "/captation", "/contact", "/references"], volume: 40, events: ["inscription_formation", "formulaire_contact", "clic_telephone", "clic_email"] },
  stat_site_wisio: { pages: ["/", "/tarifs", "/fonctionnalites", "/demo", "/blog", "/contact"], volume: 25, events: ["demande_demo", "clic_sortant"] },
  stat_site_evadif: { pages: ["/", "/eva-pilot", "/eva-tx", "/tarifs", "/telechargement", "/contact"], volume: 12, events: ["demande_demo", "clic_email"] },
};
const REFS: [string | null, number][] = [[null, 40], ["google.com", 35], ["linkedin.com", 10], ["bing.com", 4], ["facebook.com", 4], ["youtube.com", 3], ["duckduckgo.com", 2]];
const UAS: [{ os: string; browser: string; deviceType: string }, number][] = [
  [{ os: "Windows", browser: "Chrome", deviceType: "desktop" }, 35],
  [{ os: "Windows", browser: "Edge", deviceType: "desktop" }, 12],
  [{ os: "macOS", browser: "Safari", deviceType: "desktop" }, 10],
  [{ os: "iOS", browser: "Mobile Safari", deviceType: "mobile" }, 18],
  [{ os: "Android", browser: "Chrome", deviceType: "mobile" }, 18],
  [{ os: "iOS", browser: "Mobile Safari", deviceType: "tablette" }, 4],
  [{ os: "Linux", browser: "Firefox", deviceType: "desktop" }, 3],
];

async function main() {
  await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
  await prisma.$queryRawUnsafe("PRAGMA synchronous = NORMAL");
  for (const t of ["statEvent", "statPageview", "statVisit", "statVisitor", "statDaily"] as const) {
    await (prisma[t] as unknown as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  const now = Date.now();
  for (const [siteId, cfg] of Object.entries(SITES)) {
    const visitors: { id: string; count: number; last: number }[] = [];
    let n = 0;
    for (let daysAgo = 395; daysAgo >= 0; daysAgo--) {
      const growth = 0.5 + (395 - daysAgo) / 395;
      const dow = new Date(now - daysAgo * 864e5).getDay();
      const perDay = Math.round(cfg.volume * growth * (dow === 0 || dow === 6 ? 0.55 : 1) * (0.7 + Math.random() * 0.6));
      for (let i = 0; i < perDay; i++) {
        const startedAt = daysAgo === 0
          ? new Date(now - Math.random() * Math.min(10 * 36e5, 864e5))
          : new Date(now - daysAgo * 864e5 - Math.random() * 864e5);
        const returning = visitors.length > 20 && Math.random() < 0.3;
        const v = returning ? visitors[Math.floor(Math.random() * visitors.length)] : { id: hash(siteId, randomUUID()), count: 0, last: 0 };
        if (!returning) visitors.push(v);
        v.count++;
        const place = pickW(PLACES);
        const ua = pickW(UAS);
        const bot = Math.random() < 0.06;
        const pages = bot ? 1 + Math.floor(Math.random() * 6) : 1 + Math.floor(Math.random() ** 2 * 6);
        const visitId = hash(siteId, randomUUID());
        const refHost = pickW(REFS);
        const pvs: { path: string; d: number }[] = [];
        for (let p = 0; p < pages; p++) pvs.push({ path: p === 0 ? pickW(cfg.pages.map((x, k) => [x, k === 0 ? 5 : 2] as [string, number])) : cfg.pages[Math.floor(Math.random() * cfg.pages.length)], d: bot ? 0 : Math.floor(Math.random() * 120) });
        const duration = pvs.reduce((s, x) => s + x.d, 0);
        const live = daysAgo === 0 && i < 4;
        const lastSeen = live ? new Date(now - Math.random() * 60e3) : new Date(startedAt.getTime() + duration * 1000);
        await prisma.statVisitor.upsert({
          where: { id: v.id },
          create: { id: v.id, siteId, firstSeenAt: startedAt, lastSeenAt: lastSeen, visitCount: v.count },
          update: { lastSeenAt: lastSeen, visitCount: v.count },
        });
        await prisma.statVisit.create({
          data: {
            id: visitId, siteId, visitorId: v.id, visitNumber: v.count, day: dayFmt.format(startedAt),
            startedAt: live ? new Date(now - 5 * 60e3) : startedAt, lastSeenAt: lastSeen,
            entryPath: pvs[0].path, exitPath: pvs.at(-1)!.path,
            referrer: refHost ? `https://www.${refHost}/` : null, referrerHost: refHost,
            utmSource: Math.random() < 0.05 ? "newsletter" : null,
            ...place, lat: place.lat + (Math.random() - 0.5) * 0.1, lon: place.lon + (Math.random() - 0.5) * 0.1,
            ipTruncated: "192.0.2.0", ...(bot ? { os: "Linux", browser: null, deviceType: "desktop" } : ua),
            screenWidth: ua.deviceType === "desktop" ? 1920 : 390, language: "fr-FR",
            pageCount: pages, durationSec: duration, isBot: bot,
          },
        });
        let t = startedAt.getTime();
        for (const pv of pvs) {
          await prisma.statPageview.create({ data: { id: hash(siteId, randomUUID()), siteId, visitId, path: pv.path, title: pv.path, createdAt: new Date(t), durationSec: pv.d } });
          t += pv.d * 1000;
        }
        if (!bot && Math.random() < 0.08) {
          await prisma.statEvent.create({ data: { siteId, visitId, name: cfg.events[Math.floor(Math.random() * cfg.events.length)], path: pvs.at(-1)!.path, createdAt: new Date(t) } });
        }
        n++;
      }
    }
    console.log(`${siteId} : ${n} visites`);
  }
}

main().finally(() => prisma.$disconnect());
