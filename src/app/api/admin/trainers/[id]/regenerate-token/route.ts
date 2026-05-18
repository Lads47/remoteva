import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildTrainerMagicLink, getTrainerById, regenerateMagicToken } from "@/lib/trainer";
import { sendTrainerWelcomeEmail } from "@/lib/mailer";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// POST /api/admin/trainers/[id]/regenerate-token
// Régénère le magic token + renvoie le mail de bienvenue (avec le nouveau lien).
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await ctx.params;
    const trainer = await getTrainerById(id);
    if (!trainer) return NextResponse.json({ error: "Formateur introuvable" }, { status: 404 });

    const newToken = await regenerateMagicToken(id);
    const magicLink = buildTrainerMagicLink(newToken);
    const emailRes = await sendTrainerWelcomeEmail({
      to: trainer.email,
      prenom: trainer.prenom,
      nom: trainer.nom,
      magicLink,
    });

    return NextResponse.json({
      success: true,
      newToken,
      magicLink,
      emailSent: emailRes.success,
      emailError: emailRes.success ? undefined : emailRes.error,
    });
  } catch (error) {
    console.error("[/api/admin/trainers/[id]/regenerate-token] POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
