// POST /api/formateur/sessions/[id]/satisfaction/send?token=...
//
// Envoie le mail d'invitation à tous les stagiaires de la session.
// L'URL envoyée dans le mail est la même pour tous : page publique
// /eval-chaud/session/[id] qui mène directement au formulaire anonyme.
//
// Pas de création préalable d'invitations en BDD : les réponses sont
// créées de façon anonyme à la soumission.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { sendSatisfactionSurveyInvite } from "@/lib/mailer";
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

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
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

    const publicBaseUrl = process.env.PUBLIC_BASE_URL || "https://evaremote.com";
    const surveyUrl = `${publicBaseUrl}/eval-chaud/session/${id}`;

    const sendResults = [];
    for (const t of contacts.trainees) {
      try {
        const r = await sendSatisfactionSurveyInvite({
          to: t.email,
          prenom: t.prenom,
          formationNomLong: contacts.formation.nomLong,
          surveyUrl,
        });
        sendResults.push({
          traineeId: t.traineeId,
          traineeName: `${t.prenom} ${t.nom}`,
          email: t.email,
          ok: r.success,
          error: r.error,
        });
      } catch (err) {
        sendResults.push({
          traineeId: t.traineeId,
          traineeName: `${t.prenom} ${t.nom}`,
          email: t.email,
          ok: false,
          error: err instanceof Error ? err.message : "Erreur inconnue",
        });
      }
    }

    // Auto-clôture des stagiaires : pour chaque stagiaire pas encore en
    // "termine"/"abandonne", on bascule à "termine" → ce qui déclenche la
    // génération + envoi automatique des docs de fin (certif + attestation)
    // ET l'archivage Drive de la synthèse globale d'évaluation pratique.
    //
    // Best-effort : si une promotion échoue, on continue les autres et on
    // remonte le détail dans la réponse pour que le formateur le sache.
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

    return NextResponse.json({
      success: true,
      sessionId: id,
      total: contacts.trainees.length,
      mailsSent: sendResults.filter((r) => r.ok).length,
      results: sendResults,
      promotions,
      surveyUrl,
    });
  } catch (error) {
    console.error("[/api/formateur/sessions/[id]/satisfaction/send] error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
