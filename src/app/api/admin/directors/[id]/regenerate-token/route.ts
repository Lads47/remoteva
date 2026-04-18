import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { regenerateMagicToken, getDirector } from "@/lib/director";
import { sendMagicLinkEmail, buildMagicLink } from "@/lib/email";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// POST /api/admin/directors/[id]/regenerate-token
// Régénère le magic token et envoie un nouveau mail au réalisateur
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await ctx.params;
    const director = await getDirector(id);
    if (!director) return NextResponse.json({ error: "Réalisateur introuvable" }, { status: 404 });

    const newToken = await regenerateMagicToken(id);
    const magicLink = buildMagicLink(newToken);

    const emailRes = await sendMagicLinkEmail({
      to: director.email,
      directorName: director.name,
      magicLink,
    });

    return NextResponse.json({
      success: true,
      newToken,
      emailSent: emailRes.success === true,
      emailError: emailRes.success ? undefined : emailRes.error,
    });
  } catch (error) {
    console.error("[/api/admin/directors/:id/regenerate-token] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
