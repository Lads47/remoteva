// POST /api/admin/trainees/[id]/send-convention
//
// Génère la convention (entreprise) ou le contrat (particulier) du stagiaire
// et l'envoie par mail (avec CGV + RI), à la demande de l'admin — même
// mécanique que l'envoi automatique au passage "Devis signé", mais déclenché
// manuellement (envoi initial ou renvoi). Ne fait jamais régresser le statut.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { generateAndMailContract } from "@/lib/trainee-documents";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const res = await generateAndMailContract(id);
    if (!res.ok) {
      return NextResponse.json({ success: false, error: res.error }, { status: 502 });
    }
    return NextResponse.json({
      success: true,
      documentType: res.documentType,
      emailSent: res.emailSent,
      emailError: res.emailError,
      driveWebUrl: res.driveWebUrl,
    });
  } catch (error) {
    console.error("[/api/admin/trainees/[id]/send-convention] error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
