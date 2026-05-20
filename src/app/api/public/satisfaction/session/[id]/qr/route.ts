// GET /api/public/satisfaction/session/[id]/qr?size=512
//
// QR code PUBLIC encodant l'URL du formulaire anonyme d'éval à chaud.
// Utilisé par la page de présentation (gros QR pour vidéoprojecteur).
// Pas d'authentification : la page existe pour les sessions actives uniquement
// (404 si la session n'existe pas).

import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import prisma from "@/lib/db";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const session = await prisma.session.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const sizeParam = parseInt(searchParams.get("size") || "512", 10);
    const size = Number.isFinite(sizeParam) ? Math.min(Math.max(sizeParam, 100), 1600) : 512;

    const publicBaseUrl = process.env.PUBLIC_BASE_URL || "https://evaremote.com";
    const url = `${publicBaseUrl}/eval-chaud/session/${id}`;

    const pngBuffer = await QRCode.toBuffer(url, {
      width: size,
      margin: 1,
      color: { dark: "#1f2244", light: "#ffffff" },
    });

    return new NextResponse(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
        "X-Survey-Url": url,
      },
    });
  } catch (error) {
    console.error("[/api/public/satisfaction/session/[id]/qr] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
