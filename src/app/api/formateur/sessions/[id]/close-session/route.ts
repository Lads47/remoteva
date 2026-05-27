// POST /api/formateur/sessions/[id]/close-session?token=<magicToken>
//
// Clôture la session : pour chaque stagiaire actif (≠ termine/abandonne),
// bascule en "termine" → ce qui déclenche en cascade :
//   - sync Sellsy step
//   - génération + envoi mail certif + attestation
//   - archivage Drive de la synthèse globale d'évaluation pratique
//
// Cas d'usage typique : à la fin de la session, le formateur a affiché le
// QR code et les stagiaires ont rempli leur éval à chaud sur place — pas
// besoin d'envoyer de mail mais besoin de générer les docs de fin.
//
// Idempotent : si tous les stagiaires sont déjà en "termine", la route
// ne fait rien (skip).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionContacts } from "@/lib/satisfaction";
import { promoteTraineeToTermine } from "@/lib/trainee-documents";

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

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id } = await ctx.params;

    const trainer = await authTrainerForSession(token, id);
    if (!trainer) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const contacts = await getSessionContacts(id);
    if (!contacts) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    if (contacts.trainees.length === 0) {
      return NextResponse.json({ error: "Aucun stagiaire inscrit dans cette session." }, { status: 400 });
    }

    const promotions = [];
    for (const t of contacts.trainees) {
      try {
        const res = await promoteTraineeToTermine(t.traineeId);
        promotions.push({
          traineeId: t.traineeId,
          traineeName: `${t.prenom} ${t.nom}`,
          promoted: res.promoted,
          alreadyTerminated: res.alreadyTerminated,
          endOfTrainingTriggered: res.endOfTrainingTriggered,
          error: res.error,
        });
      } catch (err) {
        promotions.push({
          traineeId: t.traineeId,
          traineeName: `${t.prenom} ${t.nom}`,
          promoted: false,
          error: err instanceof Error ? err.message : "Erreur inconnue",
        });
      }
    }

    const newlyTerminated = promotions.filter((p) => p.promoted).length;
    const alreadyTerminated = promotions.filter((p) => p.alreadyTerminated).length;
    const failed = promotions.filter((p) => !p.promoted && !p.alreadyTerminated).length;

    return NextResponse.json({
      success: true,
      sessionId: id,
      total: contacts.trainees.length,
      newlyTerminated,
      alreadyTerminated,
      failed,
      promotions,
    });
  } catch (error) {
    console.error("[/api/formateur/sessions/[id]/close-session] error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
