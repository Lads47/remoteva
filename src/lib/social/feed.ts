import prisma from "@/lib/db";

export const FEED_SIZE = 20;

export interface FeedPost {
  id: string;
  network: string;
  brand: string;
  handle: string;
  avatar: string | null; // URL publique de l'image locale
  permalink: string;
  caption: string | null;
  mediaType: string;
  image: string | null;
  publishedAt: Date;
}

export const mediaUrl = (file: string | null) => (file ? `/api/public/social/media/${file}` : null);

// Les 20 dernières publications de tous nos comptes actifs, les plus récentes d'abord.
export async function latestPosts(limit = FEED_SIZE): Promise<FeedPost[]> {
  const rows = await prisma.socialPost.findMany({
    where: { hidden: false, account: { active: true } },
    orderBy: { publishedAt: "desc" },
    take: limit,
    include: { account: { select: { network: true, brand: true, handle: true, avatarPath: true } } },
  });
  return rows.map((p) => ({
    id: p.id,
    network: p.account.network,
    brand: p.account.brand,
    handle: p.account.handle,
    avatar: mediaUrl(p.account.avatarPath),
    permalink: p.permalink,
    caption: p.caption,
    mediaType: p.mediaType,
    image: mediaUrl(p.mediaPath),
    publishedAt: p.publishedAt,
  }));
}

export function ilYa(date: Date, now = new Date()): string {
  const min = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
  if (min < 60) return min <= 1 ? "à l'instant" : `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  if (j < 7) return j === 1 ? "hier" : `il y a ${j} jours`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: j > 300 ? "numeric" : undefined, timeZone: "Europe/Paris" });
}

// Répartition en colonnes, de gauche à droite : la plus récente en haut à gauche,
// la suivante en haut au milieu, etc. (lecture naturelle, contrairement aux colonnes CSS).
export function toColumns<T>(items: T[], n = 3): T[][] {
  const cols: T[][] = Array.from({ length: n }, () => []);
  items.forEach((item, i) => cols[i % n].push(item));
  return cols;
}
