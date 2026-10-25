import db, { ensureWal } from "./db";
import { addDays, dailySeries, type DayAggregate } from "./aggregate";
import { parisDay } from "./util";

export const PERIODS = { "7j": 7, "30j": 30, "90j": 90, "12m": 365 } as const;
export type Period = keyof typeof PERIODS;
export const PERIOD_LABELS: Record<Period, string> = { "7j": "7 jours", "30j": "30 jours", "90j": "90 jours", "12m": "12 mois" };

export function parsePeriod(v: string | undefined): Period {
  return v && v in PERIODS ? (v as Period) : "30j";
}

export interface CardFigure { visits: number; pageviews: number }
export interface SeriesPoint { day: string; visits: number; avg7: number }

export interface Row { key: string; label: string; count: number; share: number }
export interface PageRow { path: string; pageviews: number; avgDurationSec: number; exitRate: number }
export interface CountryRow {
  code: string | null; visitors: number; visits: number; share: number;
  avgDurationSec: number; pagesPerVisit: number; bounceRate: number;
}

export interface Overview {
  cards: { today: CardFigure; yesterday: CardFigure; thisMonth: CardFigure; lastMonth: CardFigure };
  series: SeriesPoint[];
  totals: { visits: number; pageviews: number; visitors: number; avgDurationSec: number; bounceRate: number };
  pages: PageRow[];
  countries: CountryRow[];
  referrers: Row[];
  devices: Row[];
  browsers: Row[];
  os: Row[];
  events: Row[];
}

const pick = (a: DayAggregate, bots: boolean): CardFigure => ({
  visits: a.visits + (bots ? a.botVisits : 0),
  pageviews: a.pageviews + (bots ? a.botPageviews : 0),
});

function sumRange(series: Map<string, DayAggregate>, from: string, to: string, bots: boolean): CardFigure {
  const out = { visits: 0, pageviews: 0 };
  for (const [d, a] of series) {
    if (d < from || d > to) continue;
    const f = pick(a, bots);
    out.visits += f.visits;
    out.pageviews += f.pageviews;
  }
  return out;
}

function rank(counts: Map<string, number>, total: number, label = (k: string) => k, limit = 10): Row[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, label: label(key), count, share: total ? count / total : 0 }));
}

const inc = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

export async function getOverview(siteId: string, period: Period, bots: boolean, now = new Date()): Promise<Overview> {
  await ensureWal();
  const today = parisDay(now);
  const from = addDays(today, -(PERIODS[period] - 1));
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthStart = `${addDays(monthStart, -1).slice(0, 7)}-01`;
  const lastMonthEnd = addDays(monthStart, -1);

  // Une seule série couvre la période ET les cartes (mois dernier compris).
  const seriesFrom = from < lastMonthStart ? from : lastMonthStart;
  const daily = await dailySeries(siteId, seriesFrom, today, now);

  const cards = {
    today: pick(daily.get(today)!, bots),
    yesterday: pick(daily.get(addDays(today, -1))!, bots),
    thisMonth: sumRange(daily, monthStart, today, bots),
    lastMonth: sumRange(daily, lastMonthStart, lastMonthEnd, bots),
  };

  const days = [...daily.keys()].filter((d) => d >= from);
  const values = days.map((d) => pick(daily.get(d)!, bots).visits);
  const series = days.map((day, i) => {
    const win = values.slice(Math.max(0, i - 6), i + 1);
    return { day, visits: values[i], avg7: win.reduce((s, v) => s + v, 0) / win.length };
  });

  const visitWhere = { siteId, day: { gte: from }, ...(bots ? {} : { isBot: false }) };
  const visits = await db.statVisit.findMany({
    where: visitWhere,
    select: {
      visitorId: true, country: true, referrerHost: true, deviceType: true, browser: true, os: true,
      durationSec: true, pageCount: true, exitPath: true,
    },
  });

  const totalVisits = visits.length;
  const visitorSet = new Set<string>();
  const exits = new Map<string, number>();
  const referrers = new Map<string, number>();
  const devices = new Map<string, number>();
  const browsers = new Map<string, number>();
  const oses = new Map<string, number>();
  const byCountry = new Map<string, { visitors: Set<string>; visits: number; duration: number; pages: number; bounces: number }>();
  let pageviews = 0, duration = 0, bounces = 0;

  for (const v of visits) {
    visitorSet.add(v.visitorId);
    pageviews += v.pageCount;
    duration += v.durationSec;
    if (v.pageCount <= 1) bounces++;
    inc(exits, v.exitPath);
    inc(referrers, v.referrerHost ?? "");
    inc(devices, v.deviceType);
    inc(browsers, v.browser ?? "Inconnu");
    inc(oses, v.os ?? "Inconnu");
    const key = v.country ?? "";
    const c = byCountry.get(key) ?? { visitors: new Set(), visits: 0, duration: 0, pages: 0, bounces: 0 };
    c.visitors.add(v.visitorId);
    c.visits++;
    c.duration += v.durationSec;
    c.pages += v.pageCount;
    if (v.pageCount <= 1) c.bounces++;
    byCountry.set(key, c);
  }

  const pageGroups = await db.statPageview.groupBy({
    by: ["path"],
    where: { siteId, visit: visitWhere },
    _count: { _all: true },
    _avg: { durationSec: true },
    orderBy: { _count: { path: "desc" } },
    take: 15,
  });

  const eventGroups = await db.statEvent.groupBy({
    by: ["name"],
    where: { siteId, visit: visitWhere },
    _count: { _all: true },
    orderBy: { _count: { name: "desc" } },
    take: 15,
  });
  const totalEvents = eventGroups.reduce((s, e) => s + e._count._all, 0);

  return {
    cards,
    series,
    totals: {
      visits: totalVisits,
      pageviews,
      visitors: visitorSet.size,
      avgDurationSec: totalVisits ? duration / totalVisits : 0,
      bounceRate: totalVisits ? bounces / totalVisits : 0,
    },
    pages: pageGroups.map((g) => ({
      path: g.path,
      pageviews: g._count._all,
      avgDurationSec: g._avg.durationSec ?? 0,
      exitRate: g._count._all ? (exits.get(g.path) ?? 0) / g._count._all : 0,
    })),
    countries: [...byCountry.entries()]
      .sort((a, b) => b[1].visits - a[1].visits)
      .slice(0, 15)
      .map(([code, c]) => ({
        code: code || null,
        visitors: c.visitors.size,
        visits: c.visits,
        share: totalVisits ? c.visits / totalVisits : 0,
        avgDurationSec: c.duration / c.visits,
        pagesPerVisit: c.pages / c.visits,
        bounceRate: c.bounces / c.visits,
      })),
    referrers: rank(referrers, totalVisits, (k) => k || "Accès direct"),
    devices: rank(devices, totalVisits, (k) => ({ desktop: "Ordinateur", mobile: "Mobile", tablette: "Tablette" })[k] ?? k),
    browsers: rank(browsers, totalVisits),
    os: rank(oses, totalVisits),
    events: rank(new Map(eventGroups.map((e) => [e.name, e._count._all])), totalEvents),
  };
}
