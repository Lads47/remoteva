import fs from "node:fs";
import path from "node:path";
import db, { ensureWal } from "./db";
import { addDays, recomputeDay } from "./aggregate";
import { ARCHIVES_DIR, BACKUPS_DIR } from "./paths";
import { getBreakdown } from "./queries";
import { listSites, type StatSiteInfo } from "./sites";
import { parisDay, retentionCutoff } from "./util";

// Entretien quotidien d'EVA Stat (cron /api/cron/stat), dans cet ordre :
// agrégats J et J-1 → archives des mois clos → agrégats manquants avant purge
// → purge du brut de plus de 13 mois → sauvegarde de stat.db.

export const BACKUPS_KEPT = 14;
const BACKUP_RE = /^stat-\d{4}-\d{2}-\d{2}\.db$/;

export function monthBounds(month: string): { from: string; to: string } {
  const next = addDays(`${month}-28`, 4).slice(0, 7);
  return { from: `${month}-01`, to: addDays(`${next}-01`, -1) };
}

export function archivePath(month: string, slug: string): string {
  return path.join(ARCHIVES_DIR, month.slice(0, 4), `${month}-${slug}.json`);
}

// Mois clos qui ont des visites et pas encore d'archive.
export function monthsToArchive(daysWithVisits: string[], today: string, archived: Set<string>): string[] {
  const current = today.slice(0, 7);
  const months = new Set(daysWithVisits.map((d) => d.slice(0, 7)).filter((m) => m < current));
  return [...months].filter((m) => !archived.has(m)).sort();
}

// Sauvegardes à supprimer : on garde les `keep` plus récentes (le nom porte la date).
export function backupsToDelete(files: string[], keep = BACKUPS_KEPT): string[] {
  return files.filter((f) => BACKUP_RE.test(f)).sort().reverse().slice(keep);
}

async function refreshRecentAggregates(site: StatSiteInfo, today: string) {
  for (const day of [addDays(today, -1), today]) await recomputeDay(site.id, day);
}

async function archiveMonth(site: StatSiteInfo, month: string, now: Date): Promise<string> {
  const { from, to } = monthBounds(month);
  const daily = await db.statDaily.findMany({ where: { siteId: site.id, date: { gte: from, lte: to } }, orderBy: { date: "asc" } });
  const detail = await getBreakdown(site.id, from, to, false, 50);
  const sum = (k: "visits" | "pageviews" | "newVisitors" | "bounces" | "totalDurationSec" | "botVisits" | "botPageviews") =>
    daily.reduce((s, d) => s + d[k], 0);
  const archive = {
    format: 1,
    note: "Archive EVA Stat : agrégats anonymes du mois, robots exclus des tableaux. Conservée sans limite de durée.",
    site: { slug: site.slug, name: site.name },
    month,
    generatedAt: now.toISOString(),
    totals: {
      visits: sum("visits"),
      pageviews: sum("pageviews"),
      visitors: detail.totals.visitors,
      newVisitors: sum("newVisitors"),
      bounces: sum("bounces"),
      totalDurationSec: sum("totalDurationSec"),
      botVisits: sum("botVisits"),
      botPageviews: sum("botPageviews"),
    },
    days: daily.map(({ date, visits, pageviews, visitors, newVisitors, bounces, totalDurationSec, botVisits, botPageviews }) => ({
      date, visits, pageviews, visitors, newVisitors, bounces, totalDurationSec, botVisits, botPageviews,
    })),
    pages: detail.pages,
    countries: detail.countries,
    referrers: detail.referrers,
    devices: detail.devices,
    browsers: detail.browsers,
    os: detail.os,
    events: detail.events,
  };
  const file = archivePath(month, site.slug);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(archive, null, 2));
  await fs.promises.rename(tmp, file);
  return file;
}

async function archiveClosedMonths(site: StatSiteInfo, today: string, now: Date): Promise<string[]> {
  const days = await db.statVisit.groupBy({ by: ["day"], where: { siteId: site.id, day: { lt: `${today.slice(0, 7)}-01` } } });
  const candidates = [...new Set(days.map((d) => d.day.slice(0, 7)))];
  const archived = new Set(candidates.filter((m) => fs.existsSync(archivePath(m, site.slug))));
  const written: string[] = [];
  for (const month of monthsToArchive(days.map((d) => d.day), today, archived)) {
    const { from, to } = monthBounds(month);
    // Un mois clos doit avoir tous ses agrégats avant d'être figé.
    const missing = days.map((d) => d.day).filter((d) => d >= from && d <= to);
    const present = new Set((await db.statDaily.findMany({ where: { siteId: site.id, date: { gte: from, lte: to } }, select: { date: true } })).map((r) => r.date));
    for (const d of missing) if (!present.has(d)) await recomputeDay(site.id, d);
    written.push(await archiveMonth(site, month, now));
  }
  return written;
}

// Avant de supprimer le brut d'un jour, on s'assure que son agrégat existe :
// les totaux journaliers, eux, sont gardés sans limite.
async function ensureAggregatesBefore(site: StatSiteInfo, cutoffDay: string) {
  const old = await db.statVisit.groupBy({ by: ["day"], where: { siteId: site.id, day: { lt: cutoffDay } } });
  if (old.length === 0) return;
  const present = new Set((await db.statDaily.findMany({ where: { siteId: site.id, date: { in: old.map((o) => o.day) } }, select: { date: true } })).map((r) => r.date));
  for (const { day } of old) if (!present.has(day)) await recomputeDay(site.id, day);
}

export interface PurgeReport { cutoff: string; events: number; pageviews: number; visits: number; visitors: number }

// Par journées entières : un jour à moitié purgé fausserait tout recalcul ultérieur.
export async function purgeExpired(now = new Date()): Promise<PurgeReport> {
  const cutoffDay = parisDay(retentionCutoff(now));
  for (const site of await listSites()) await ensureAggregatesBefore(site, cutoffDay);
  const oldVisit = { day: { lt: cutoffDay } };
  const events = await db.statEvent.deleteMany({ where: { visit: oldVisit } });
  const pageviews = await db.statPageview.deleteMany({ where: { visit: oldVisit } });
  const visits = await db.statVisit.deleteMany({ where: oldVisit });
  const visitors = await db.statVisitor.deleteMany({ where: { visits: { none: {} } } });
  return { cutoff: cutoffDay, events: events.count, pageviews: pageviews.count, visits: visits.count, visitors: visitors.count };
}

export async function backupDatabase(now = new Date()): Promise<{ file: string | null; deleted: string[] }> {
  await fs.promises.mkdir(BACKUPS_DIR, { recursive: true });
  const file = path.join(BACKUPS_DIR, `stat-${parisDay(now)}.db`);
  let written: string | null = null;
  if (!fs.existsSync(file)) {
    // VACUUM INTO : copie cohérente même pendant les écritures (WAL).
    await db.$executeRawUnsafe(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    written = file;
  }
  const deleted = backupsToDelete(await fs.promises.readdir(BACKUPS_DIR));
  for (const f of deleted) await fs.promises.rm(path.join(BACKUPS_DIR, f), { force: true });
  return { file: written, deleted };
}

export interface MaintenanceReport {
  sites: string[];
  aggregated: string[];
  archives: string[];
  purge: PurgeReport;
  backup: { file: string | null; deleted: string[] };
}

export async function runMaintenance(now = new Date()): Promise<MaintenanceReport> {
  await ensureWal();
  const today = parisDay(now);
  const sites = await listSites();
  const archives: string[] = [];
  for (const site of sites) {
    await refreshRecentAggregates(site, today);
    archives.push(...(await archiveClosedMonths(site, today, now)));
  }
  const purge = await purgeExpired(now);
  const backup = await backupDatabase(now);
  return {
    sites: sites.map((s) => s.slug),
    aggregated: [addDays(today, -1), today],
    archives: archives.map((f) => path.relative(ARCHIVES_DIR, f)),
    purge,
    backup: { file: backup.file && path.basename(backup.file), deleted: backup.deleted },
  };
}

// Ce que ferait le cron, sans rien écrire (GET de la route).
export async function maintenanceStatus(now = new Date()) {
  const cutoffDay = parisDay(retentionCutoff(now));
  const today = parisDay(now);
  const sites = await listSites();
  const pendingArchives: string[] = [];
  for (const site of sites) {
    const days = await db.statVisit.groupBy({ by: ["day"], where: { siteId: site.id, day: { lt: `${today.slice(0, 7)}-01` } } });
    const months = [...new Set(days.map((d) => d.day.slice(0, 7)))];
    const archived = new Set(months.filter((m) => fs.existsSync(archivePath(m, site.slug))));
    pendingArchives.push(...monthsToArchive(days.map((d) => d.day), today, archived).map((m) => `${m}-${site.slug}`));
  }
  const backups = fs.existsSync(BACKUPS_DIR) ? (await fs.promises.readdir(BACKUPS_DIR)).filter((f) => BACKUP_RE.test(f)).sort() : [];
  return {
    cutoff: cutoffDay,
    visitsToPurge: await db.statVisit.count({ where: { day: { lt: cutoffDay } } }),
    pendingArchives,
    lastBackup: backups.at(-1) ?? null,
    backups: backups.length,
  };
}
