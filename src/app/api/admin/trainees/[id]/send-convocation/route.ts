// POST /api/admin/trainees/[id]/send-convocation
//
// Génère et envoie la convocation au stagiaire, hors fenêtre normale du cron
// J-14. Utile pour :
//   - tests bout-en-bout
//   - inscriptions last-minute (session démarre dans moins de 14 jours)
//   - ré-envoi après correction d'email
//   - re-génération si convocation perdue
//
// La fonction lib gère :
//   - génération du doc Drive + substitutions
//   - export PDF + envoi mail avec RI en PJ
//   - transition statut → "convoque" si pas déjà avancé
//   - sync Sellsy step
//   - update dateConvocation
//
// Idempotent côté mail : si l'admin clique 2 fois, 2 mails partent (par design,
// pour permettre le ré-envoi). La transition de statut, elle, ne régresse pas.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { generateAndMailConvocation } from "@/lib/trainee-documents";

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const { id } = await ctx.params;
    const res = await generateAndMailConvocation(id);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      driveFileId: res.driveFileId,
      driveWebUrl: res.driveWebUrl,
      emailSent: res.emailSent,
      emailError: res.emailError,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[/api/admin/trainees/[id]/send-convocation] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
