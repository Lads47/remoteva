import db, { ensureWal } from "./db";
import type { CollectPayload, PageviewPayload } from "./payload";
import type { StatSiteInfo } from "./sites";
import { lookupGeo } from "./geo";
import { truncateIp } from "./ip";
import { parseUa } from "./ua";
import { cleanReferrer, hashId, parisDay } from "./util";

export interface IngestContext {
  ip: string | null; // IP complète : sert à la géoloc, jamais écrite
  userAgent: string | null;
  now?: Date;
}

const MAX_PAGE_SEC = 4 * 3600;

export async function ingest(site: StatSiteInfo, msg: CollectPayload, ctx: IngestContext) {
  const now = ctx.now ?? new Date();
  await ensureWal();
  switch (msg.t) {
    case "pageview":
      return ingestPageview(site, msg, ctx, now);
    case "heartbeat":
    case "leave":
      return ingestPing(site, msg.p, msg.d, now);
    case "event":
      return ingestEvent(site, msg, now);
  }
}

async function ingestPageview(
  site: StatSiteInfo,
  msg: PageviewPayload,
  ctx: IngestContext,
  now: Date
) {
  const visitorId = hashId(site.id, msg.v);
  const visitId = hashId(site.id, msg.se);
  const pageviewId = hashId(site.id, msg.p);

  // Géoloc et UA hors transaction : rien ne doit tenir le verrou d'écriture SQLite.
  const existingVisit = await db.statVisit.findUnique({ where: { id: visitId }, select: { id: true } });
  const geo = existingVisit ? {} : await lookupGeo(ctx.ip);
  const ua = parseUa(ctx.userAgent, msg.b === 1);
  const ref = cleanReferrer(msg.r, site.domains);

  await db.$transaction(async (tx) => {
    if (await tx.statPageview.findUnique({ where: { id: pageviewId }, select: { id: true } })) return;

    const visitor = await tx.statVisitor.upsert({
      where: { id: visitorId },
      create: { id: visitorId, siteId: site.id, firstSeenAt: now, lastSeenAt: now, visitCount: 0 },
      update: { lastSeenAt: now },
    });

    const visit = await tx.statVisit.findUnique({ where: { id: visitId } });
    if (!visit) {
      await tx.statVisitor.update({ where: { id: visitorId }, data: { visitCount: { increment: 1 } } });
      await tx.statVisit.create({
        data: {
          id: visitId,
          siteId: site.id,
          visitorId,
          visitNumber: visitor.visitCount + 1,
          day: parisDay(now),
          startedAt: now,
          lastSeenAt: now,
          entryPath: msg.u,
          exitPath: msg.u,
          referrer: ref?.referrer ?? null,
          referrerHost: ref?.referrerHost ?? null,
          utmSource: msg.us ?? null,
          utmMedium: msg.um ?? null,
          utmCampaign: msg.uc ?? null,
          country: geo.country ?? null,
          region: geo.region ?? null,
          city: geo.city ?? null,
          lat: geo.lat ?? null,
          lon: geo.lon ?? null,
          isp: geo.isp ?? null,
          ipTruncated: ctx.ip ? truncateIp(ctx.ip) : null,
          os: ua.os,
          browser: ua.browser,
          deviceType: ua.deviceType,
          screenWidth: msg.w ?? null,
          language: msg.l ?? null,
          pageCount: 1,
          isBot: ua.isBot,
        },
      });
    } else {
      await tx.statVisit.update({
        where: { id: visitId },
        data: { pageCount: { increment: 1 }, exitPath: msg.u, lastSeenAt: now },
      });
    }

    await tx.statPageview.create({
      data: {
        id: pageviewId,
        siteId: site.id,
        visitId,
        path: msg.u,
        title: msg.ti || null,
        createdAt: now,
      },
    });
  });
}

// La page est retrouvée par son id, même si la session a été renouvelée entre-temps.
async function ingestPing(site: StatSiteInfo, clientPageviewId: string, seconds: number, now: Date) {
  const pageviewId = hashId(site.id, clientPageviewId);
  const d = Math.min(seconds, MAX_PAGE_SEC);
  await db.$transaction(async (tx) => {
    const pv = await tx.statPageview.findUnique({ where: { id: pageviewId } });
    if (!pv || pv.siteId !== site.id) return;
    const delta = Math.max(0, d - pv.durationSec);
    if (delta > 0) {
      await tx.statPageview.update({ where: { id: pageviewId }, data: { durationSec: d } });
    }
    await tx.statVisit.update({
      where: { id: pv.visitId },
      data: { lastSeenAt: now, ...(delta > 0 ? { durationSec: { increment: delta } } : {}) },
    });
  });
}

async function ingestEvent(site: StatSiteInfo, msg: Extract<CollectPayload, { t: "event" }>, now: Date) {
  const visitId = hashId(site.id, msg.se);
  const visit = await db.statVisit.findUnique({ where: { id: visitId }, select: { siteId: true } });
  if (!visit || visit.siteId !== site.id) return;
  await db.statEvent.create({
    data: {
      siteId: site.id,
      visitId,
      name: msg.n,
      props: msg.pr ? JSON.stringify(msg.pr) : null,
      path: msg.u,
      createdAt: now,
    },
  });
  await db.statVisit.update({ where: { id: visitId }, data: { lastSeenAt: now } });
}
