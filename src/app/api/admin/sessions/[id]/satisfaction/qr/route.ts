// GET /api/admin/sessions/[id]/satisfaction/qr?size=400
//
// Équivalent admin du QR code formateur.

import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSession } from "@/lib/auth";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { searchParams } = new URL(request.url);
    const sizeParam = parseInt(searchParams.get("size") || "400", 10);
    const size = Number.isFinite(sizeParam) ? Math.min(Math.max(sizeParam, 100), 1200) : 400;
    const { id } = await ctx.params;

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
        "Cache-Control": "private, max-age=300",
        "X-Survey-Url": url,
      },
    });
  } catch (error) {
    console.error("[/api/admin/sessions/[id]/satisfaction/qr] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
