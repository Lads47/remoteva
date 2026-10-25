import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireSuperAdmin } from "@/lib/social/auth";
import { mediaUrl } from "@/lib/social/feed";
import { InstagramError } from "@/lib/social/instagram";
import { connectInstagram } from "@/lib/social/sync";

export const dynamic = "force-dynamic";

// Liste des comptes reliés — jamais le jeton, même chiffré.
export async function GET() {
  const denied = await requireSuperAdmin();
  if (denied) return denied;
  const accounts = await prisma.socialAccount.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { posts: true } } },
  });
  return NextResponse.json({
    accounts: accounts.map((a) => ({
      id: a.id,
      network: a.network,
      brand: a.brand,
      handle: a.handle,
      avatar: mediaUrl(a.avatarPath),
      active: a.active,
      tokenExpiresAt: a.tokenExpiresAt,
      lastSyncAt: a.lastSyncAt,
      lastError: a.lastError,
      posts: a._count.posts,
    })),
  });
}

const addSchema = z.object({
  network: z.enum(["instagram", "linkedin"]),
  brand: z.string().trim().min(1).max(80),
  token: z.string().trim().min(20).max(1000),
});

export async function POST(req: NextRequest) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;
  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Marque et jeton requis." }, { status: 400 });
  const { network, brand, token } = parsed.data;
  if (network === "linkedin") {
    return NextResponse.json({ error: "LinkedIn : en attente de l'autorisation de LinkedIn (Community Management API)." }, { status: 400 });
  }
  try {
    const account = await connectInstagram(token, brand);
    return NextResponse.json({ ok: true, id: account.id, handle: account.handle });
  } catch (err) {
    const message = err instanceof InstagramError
      ? `Instagram refuse ce jeton : ${err.message}`
      : err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
