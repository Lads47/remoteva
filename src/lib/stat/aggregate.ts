import db from "./db";
import { parisDay } from "./util";

export interface DayRow {
  visitorId: string;
  visitNumber: number;
  pageCount: number;
  durationSec: number;
  isBot: boolean;
}

export interface DayAggregate {
  visits: number;
  pageviews: number;
  visitors: number;
  newVisitors: number;
  bounces: number;
  totalDurationSec: number;
  botVisits: number;
  botPageviews: number;
}

export const EMPTY_DAY: DayAggregate = {
  visits: 0, pageviews: 0, visitors: 0, newVisitors: 0, bounces: 0,
  totalDurationSec: 0, botVisits: 0, botPageviews: 0,
};

// Une visite compte pour le jour où elle commence (heure de Paris).
// Rebond = visite d'une seule page.
export function aggregateDay(rows: DayRow[]): DayAggregate {
  const a = { ...EMPTY_DAY };
  const visitors = new Set<string>();
  for (const r of rows) {
    if (r.isBot) {
      a.botVisits++;
      a.botPageviews += r.pageCount;
      continue;
    }
    a.visits++;
    a.pageviews += r.pageCount;
    visitors.add(r.visitorId);
    if (r.visitNumber === 1) a.newVisitors++;
    if (r.pageCount <= 1) a.bounces++;
    a.totalDurationSec += r.durationSec;
  }
  a.visitors = visitors.size;
  return a;
}

const DAY_SELECT = { visitorId: true, visitNumber: true, pageCount: true, durationSec: true, isBot: true } as const;

export async function computeDay(siteId: string, day: string): Promise<DayAggregate> {
  const rows = await db.statVisit.findMany({ where: { siteId, day }, select: DAY_SELECT });
  return aggregateDay(rows);
}

export async function recomputeDay(siteId: string, day: string): Promise<DayAggregate> {
  const a = await computeDay(siteId, day);
  await db.statDaily.upsert({
    where: { siteId_date: { siteId, date: day } },
    create: { siteId, date: day, ...a },
    update: a,
  });
  return a;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// Série jour par jour : agrégats pour les jours passés (calculés à la volée s'ils
// manquent encore), tables brutes pour aujourd'hui.
export async function dailySeries(
  siteId: string,
  from: string,
  to: string,
  now = new Date()
): Promise<Map<string, DayAggregate>> {
  const today = parisDay(now);
  const stored = await db.statDaily.findMany({
    where: { siteId, date: { gte: from, lte: to } },
  });
  const byDay = new Map<string, DayAggregate>();
  for (const s of stored) {
    byDay.set(s.date, {
      visits: s.visits, pageviews: s.pageviews, visitors: s.visitors, newVisitors: s.newVisitors,
      bounces: s.bounces, totalDurationSec: s.totalDurationSec, botVisits: s.botVisits, botPageviews: s.botPageviews,
    });
  }

  const pastEnd = to < today ? to : addDays(today, -1);
  if (from <= pastEnd) {
    const withVisits = await db.statVisit.groupBy({
      by: ["day"],
      where: { siteId, day: { gte: from, lte: pastEnd } },
    });
    for (const { day } of withVisits) {
      if (!byDay.has(day)) byDay.set(day, await recomputeDay(siteId, day));
    }
  }
  if (from <= today && today <= to) byDay.set(today, await computeDay(siteId, today));

  const out = new Map<string, DayAggregate>();
  for (const d of daysBetween(from, to)) out.set(d, byDay.get(d) ?? { ...EMPTY_DAY });
  return out;
}
