import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireSuperAdmin } from "@/lib/social/auth";
import { mediaUrl } from "@/lib/social/feed";

export const dynamic = "force-dynamic";

// Publications récupérées (masquées comprises), pour en retirer une de l'accueil.
export async function GET() {
  const denied = await requireSuperAdmin();
  if (denied) return denied;
  const posts = await prisma.socialPost.findMany({
    orderBy: { publishedAt: "desc" },
    take: 60,
    include: { account: { select: { brand: true, network: true, handle: true } } },
  });
  return NextResponse.json({
    posts: posts.map((p) => ({
      id: p.id,
      brand: p.account.brand,
      network: p.account.network,
      handle: p.account.handle,
      caption: p.caption,
      image: mediaUrl(p.mediaPath),
      permalink: p.permalink,
      publishedAt: p.publishedAt,
      hidden: p.hidden,
    })),
  });
}
