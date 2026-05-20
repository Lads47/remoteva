// GET /api/formateur/sessions/[id]/satisfaction/preview?token=...
//
// Renvoie les questions résolues (set global ou override formation) pour
// que le formateur puisse prévisualiser le formulaire avant envoi.
// Pas d'écriture en BDD, aucune invitation créée.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolveQuestionsForFormation } from "@/lib/satisfaction";

async function authTrainerForSession(token: string | null, sessionId: string) {
  if (!token) return null;
  const trainer = await prisma.trainer.findUnique({ where: { magicToken: token } });
  if (!trainer || !trainer.active) return null;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { trainerId: true, formationId: true },
  });
  if (!session || session.trainerId !== trainer.id) return null;
  return { trainer, formationId: session.formationId };
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id } = await ctx.params;

    const auth = await authTrainerForSession(token, id);
    if (!auth) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const questions = await resolveQuestionsForFormation(auth.formationId);
    const session = await prisma.session.findUnique({
      where: { id },
      include: { formation: { select: { nomLong: true } } },
    });
    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

    return NextResponse.json({
      session: { code: session.code, dateDebut: session.dateDebut, dateFin: session.dateFin },
      formation: { nomLong: session.formation.nomLong },
      questions,
    });
  } catch (error) {
    console.error("[/api/formateur/sessions/[id]/satisfaction/preview] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
