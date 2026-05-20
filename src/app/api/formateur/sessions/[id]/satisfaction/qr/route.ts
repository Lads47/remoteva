// GET /api/formateur/sessions/[id]/satisfaction/qr?token=...&size=400
//
// Renvoie un PNG contenant le QR code du formulaire d'éval à chaud anonyme.
// L'URL ouvre directement le formulaire — pas d'identification du stagiaire.
//
// On utilise un endpoint API (au lieu d'un client-side rendering) pour
// que le formateur puisse facilement télécharger / imprimer le QR.

import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import prisma from "@/lib/db";

async function authTrainerForSession(token: string | null, sessionId: string) {
  if (!token) return null;
  const trainer = await prisma.trainer.findUnique({ where: { magicToken: token } });
  if (!trainer || !trainer.active) return null;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { trainerId: true },
  });
  if (!session || session.trainerId !== trainer.id) return null;
  return trainer;
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const sizeParam = parseInt(searchParams.get("size") || "400", 10);
    const size = Number.isFinite(sizeParam) ? Math.min(Math.max(sizeParam, 100), 1200) : 400;
    const { id } = await ctx.params;

    const trainer = await authTrainerForSession(token, id);
    if (!trainer) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const publicBaseUrl = process.env.PUBLIC_BASE_URL || "https://evaremote.com";
    const url = `${publicBaseUrl}/eval-chaud/session/${id}`;

    const pngBuffer = await QRCode.toBuffer(url, {
      width: size,
      margin: 2,
      color: { dark: "#1f2244", light: "#ffffff" },
    });

    return new NextResponse(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=300", // 5 min cache
        "X-Survey-Url": url,
      },
    });
  } catch (error) {
    console.error("[/api/formateur/sessions/[id]/satisfaction/qr] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
