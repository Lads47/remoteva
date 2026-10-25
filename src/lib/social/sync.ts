import prisma from "@/lib/db";
import { decryptToken, encryptToken } from "./crypto";
import { fetchMedia, fetchProfile, refreshToken, shouldRefresh } from "./instagram";
import { cacheImage, removeImage } from "./media";

const POSTS_PER_ACCOUNT = 20;
// Un jeton généré dans le tableau de bord Meta vaut 60 jours ; on prend une marge.
const DASHBOARD_TOKEN_DAYS = 59;

export const NETWORKS = { instagram: "Instagram", linkedin: "LinkedIn" } as const;
export type Network = keyof typeof NETWORKS;

// Ajout (ou remplacement du jeton) d'un compte Instagram : le jeton est vérifié auprès
// d'Instagram avant d'être enregistré.
export async function connectInstagram(token: string, brand: string) {
  const profile = await fetchProfile(token);
  const data = {
    brand,
    handle: profile.username,
    tokenEnc: encryptToken(token),
    tokenExpiresAt: new Date(Date.now() + DASHBOARD_TOKEN_DAYS * 86_400_000),
    active: true,
    lastError: null,
  };
  const account = await prisma.socialAccount.upsert({
    where: { network_externalId: { network: "instagram", externalId: profile.id } },
    create: { network: "instagram", externalId: profile.id, ...data },
    update: data,
  });
  await syncAccount(account.id);
  return account;
}

export interface SyncReport { account: string; posts: number; removed: number; refreshed: boolean; error?: string }

export async function syncAccount(accountId: string): Promise<SyncReport> {
  const account = await prisma.socialAccount.findUniqueOrThrow({ where: { id: accountId } });
  const report: SyncReport = { account: `${account.network}:${account.handle}`, posts: 0, removed: 0, refreshed: false };
  if (account.network !== "instagram") {
    report.error = "réseau pas encore pris en charge";
    return report;
  }
  try {
    let token = decryptToken(account.tokenEnc);
    if (shouldRefresh(account.tokenExpiresAt)) {
      const fresh = await refreshToken(token);
      token = fresh.token;
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: { tokenEnc: encryptToken(token), tokenExpiresAt: fresh.expiresAt },
      });
      report.refreshed = true;
    }

    const profile = await fetchProfile(token);
    const avatarPath = await cacheImage(profile.profilePictureUrl, `avatar_${account.id}`).catch(() => null);
    const media = await fetchMedia(token, POSTS_PER_ACCOUNT);

    const keep = new Set<string>();
    for (const m of media) {
      const id = `instagram:${m.id}`;
      keep.add(id);
      const mediaPath = await cacheImage(m.imageUrl, `ig_${m.id}`).catch(() => null);
      await prisma.socialPost.upsert({
        where: { id },
        create: { id, accountId: account.id, permalink: m.permalink, caption: m.caption, mediaType: m.mediaType, mediaPath, publishedAt: m.timestamp },
        // `hidden` n'est pas touché : un post masqué dans l'admin le reste.
        update: { permalink: m.permalink, caption: m.caption, mediaType: m.mediaType, mediaPath, publishedAt: m.timestamp, fetchedAt: new Date() },
      });
    }
    report.posts = media.length;

    // Ce qui n'est plus dans les 20 dernières (effacé sur Instagram, ou trop ancien) part, image comprise.
    const stale = await prisma.socialPost.findMany({ where: { accountId: account.id, id: { notIn: [...keep] } } });
    for (const p of stale) await removeImage(p.mediaPath);
    await prisma.socialPost.deleteMany({ where: { id: { in: stale.map((p) => p.id) } } });
    report.removed = stale.length;

    await prisma.socialAccount.update({
      where: { id: account.id },
      data: { handle: profile.username, avatarPath: avatarPath ?? account.avatarPath, lastSyncAt: new Date(), lastError: null },
    });
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
    await prisma.socialAccount.update({ where: { id: account.id }, data: { lastError: report.error.slice(0, 500) } });
  }
  return report;
}

export async function syncAll(): Promise<SyncReport[]> {
  const accounts = await prisma.socialAccount.findMany({ where: { active: true }, select: { id: true } });
  const reports: SyncReport[] = [];
  for (const a of accounts) reports.push(await syncAccount(a.id));
  return reports;
}

export async function deleteAccount(accountId: string) {
  const account = await prisma.socialAccount.findUnique({ where: { id: accountId }, include: { posts: true } });
  if (!account) return;
  for (const p of account.posts) await removeImage(p.mediaPath);
  await removeImage(account.avatarPath);
  await prisma.socialAccount.delete({ where: { id: accountId } });
}
